import type Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { INCIDENT_NEW } from '@httpbin-monitor/shared';
import type { AIClient } from './client.js';
import type { AILimiter } from './limiter.js';
import { acquireLlmCall } from './acquire-llm.js';
import { loadPrompt } from './prompts.js';
import { toIncident } from '../incident-mapper.js';
import { toResponseRecord } from '../response-mapper.js';

export const REPORT_INCIDENT_TOOL: Anthropic.Tool = {
  name: 'report_incident',
  description: 'Record an incident report for an anomalous response.',
  input_schema: {
    type: 'object',
    properties: {
      severity: { type: 'string', enum: ['low', 'medium', 'high'] },
      summary: { type: 'string', description: 'One-sentence summary' },
      rootCauses: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      recommendations: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    },
    required: ['severity', 'summary', 'rootCauses', 'recommendations'],
  },
};

type IncidentPayload = {
  severity: 'low' | 'medium' | 'high';
  summary: string;
  rootCauses: string[];
  recommendations: string[];
};

function parseIncidentToolInput(input: unknown): IncidentPayload | null {
  if (typeof input !== 'object' || input === null) return null;

  const value = input as Record<string, unknown>;
  if (
    typeof value.summary !== 'string' ||
    !['low', 'medium', 'high'].includes(String(value.severity)) ||
    !Array.isArray(value.rootCauses) ||
    !Array.isArray(value.recommendations)
  ) {
    return null;
  }

  return {
    severity: value.severity as IncidentPayload['severity'],
    summary: value.summary,
    rootCauses: value.rootCauses.map(String),
    recommendations: value.recommendations.map(String),
  };
}

export function startIncidentMonitor(deps: {
  prisma: PrismaClient;
  ai: AIClient;
  limiter: AILimiter;
  broadcaster: Server;
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}): { stop: () => void } {
  const tick = async () => {
    try {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const successRows = await deps.prisma.response.findMany({
        where: {
          timestamp: { gte: hourAgo },
          statusCode: { gte: 200, lt: 300 },
        },
        select: { responseTimeMs: true },
      });

      if (successRows.length === 0) return;

      const rollingAverage =
        successRows.reduce((sum, row) => sum + row.responseTimeMs, 0) / successRows.length;

      const slowRows = await deps.prisma.response.findMany({
        where: {
          timestamp: { gte: fiveMinutesAgo },
          responseTimeMs: { gt: Math.round(rollingAverage * 2) },
        },
        orderBy: { timestamp: 'desc' },
        take: 5,
      });

      for (const row of slowRows) {
        const existing = await deps.prisma.incident.findFirst({
          where: { responseId: row.id },
        });
        if (existing) continue;

        const responseRecord = toResponseRecord(row);
        let payload: IncidentPayload | null = null;

        const incidentSystem = loadPrompt('incident-system');
        const incidentMessages: Anthropic.MessageParam[] = [
          {
            role: 'user',
            content: JSON.stringify({
              rollingAverageMs: Math.round(rollingAverage),
              response: responseRecord,
            }),
          },
        ];

        const acquired = await acquireLlmCall({
          ai: deps.ai,
          limiter: deps.limiter,
          system: incidentSystem,
          messages: incidentMessages,
          tools: [REPORT_INCIDENT_TOOL],
        });

        if (acquired.ok) {
          try {
            const completion = await deps.ai.completeWithForcedTool({
              system: incidentSystem,
              tool: REPORT_INCIDENT_TOOL,
              messages: incidentMessages,
              maxTokens: 512,
            });
            payload = parseIncidentToolInput(completion.input);
          } catch (err) {
            deps.logger.error('incident monitor: LLM call failed', err);
          }
        } else {
          deps.logger.info(
            `incident monitor: skipped LLM for ${row.id} (${acquired.reason})`,
          );
        }

        const incidentData = payload ?? {
          severity: 'medium' as const,
          summary: 'Auto-generated incident — LLM output unparseable',
          rootCauses: ['Response time exceeded 2x rolling average'],
          recommendations: ['Investigate upstream latency and retry patterns'],
        };

        const saved = await deps.prisma.incident.create({
          data: {
            responseId: row.id,
            severity: incidentData.severity,
            summary: incidentData.summary,
            rootCauses: {
              rootCauses: incidentData.rootCauses,
              recommendations: incidentData.recommendations,
            },
          },
        });

        const incident = toIncident(saved);
        deps.broadcaster.emit(INCIDENT_NEW, incident);
        deps.logger.info(`incident created for response ${row.id}`);
      }
    } catch (err) {
      deps.logger.error('incident monitor tick failed', err);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), 60_000);

  return {
    stop: () => clearInterval(timer),
  };
}
