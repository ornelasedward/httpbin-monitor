import type Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';

const METRICS = [
  'count',
  'avg_response_time',
  'p95_response_time',
  'error_rate',
  'list_recent',
  'list_slowest',
] as const;

const STATUS_FILTERS = ['all', 'success', 'error'] as const;

export type QueryResponsesInput = {
  metric: (typeof METRICS)[number];
  windowMinutes: number;
  statusFilter?: (typeof STATUS_FILTERS)[number];
  limit?: number;
};

export const queryResponsesTool: Anthropic.Tool = {
  name: 'query_responses',
  description:
    'Query the HTTP responses table. Use this to answer any question about specific data: counts, averages, slowest, recent errors, etc.',
  input_schema: {
    type: 'object',
    properties: {
      metric: {
        enum: [...METRICS],
      },
      windowMinutes: { type: 'number', minimum: 1, maximum: 1440 },
      statusFilter: { enum: [...STATUS_FILTERS] },
      limit: { type: 'number', minimum: 1, maximum: 50 },
    },
    required: ['metric', 'windowMinutes'],
  },
};

export function validateQueryResponsesInput(input: unknown): QueryResponsesInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid tool input');
  }

  const value = input as Record<string, unknown>;
  if (!METRICS.includes(value.metric as (typeof METRICS)[number])) {
    throw new Error(`Invalid metric: ${String(value.metric)}`);
  }

  const windowMinutes = Number(value.windowMinutes);
  if (!Number.isFinite(windowMinutes) || windowMinutes < 1 || windowMinutes > 1440) {
    throw new Error('windowMinutes must be between 1 and 1440');
  }

  const statusFilter = (value.statusFilter ?? 'all') as (typeof STATUS_FILTERS)[number];
  if (!STATUS_FILTERS.includes(statusFilter)) {
    throw new Error(`Invalid statusFilter: ${String(value.statusFilter)}`);
  }

  const limit =
    value.limit === undefined ? 10 : Number(value.limit);
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    throw new Error('limit must be between 1 and 50');
  }

  return {
    metric: value.metric as QueryResponsesInput['metric'],
    windowMinutes,
    statusFilter,
    limit,
  };
}

function isSuccess(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

function windowStart(windowMinutes: number): Date {
  return new Date(Date.now() - windowMinutes * 60 * 1000);
}

function statusWhere(statusFilter: QueryResponsesInput['statusFilter']) {
  if (statusFilter === 'success') {
    return { statusCode: { gte: 200, lt: 300 } };
  }
  if (statusFilter === 'error') {
    return {
      OR: [
        { statusCode: { lt: 200 } },
        { statusCode: { gte: 300 } },
        { statusCode: 0 },
      ],
    };
  }
  return {};
}

function payloadSnippet(
  requestPayload: unknown,
  responseBody: unknown,
): { requestPayload: unknown; responseJson: unknown } {
  const body =
    typeof responseBody === 'object' && responseBody !== null
      ? (responseBody as Record<string, unknown>)
      : null;
  return {
    requestPayload,
    responseJson: body?.json ?? null,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

export async function executeQueryResponses(
  input: unknown,
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const query = validateQueryResponsesInput(input);
  const since = windowStart(query.windowMinutes);
  const where = {
    timestamp: { gte: since },
    ...statusWhere(query.statusFilter ?? 'all'),
  };

  switch (query.metric) {
    case 'count': {
      const count = await prisma.response.count({ where });
      return { metric: query.metric, windowMinutes: query.windowMinutes, count };
    }
    case 'avg_response_time': {
      const aggregate = await prisma.response.aggregate({
        where,
        _avg: { responseTimeMs: true },
      });
      return {
        metric: query.metric,
        windowMinutes: query.windowMinutes,
        avgResponseTimeMs: Math.round(aggregate._avg.responseTimeMs ?? 0),
      };
    }
    case 'p95_response_time': {
      const rows = await prisma.response.findMany({
        where,
        select: { responseTimeMs: true },
      });
      return {
        metric: query.metric,
        windowMinutes: query.windowMinutes,
        p95ResponseTimeMs: percentile(
          rows.map((row) => row.responseTimeMs),
          95,
        ),
      };
    }
    case 'error_rate': {
      const [total, errors] = await Promise.all([
        prisma.response.count({ where }),
        prisma.response.count({
          where: {
            timestamp: { gte: since },
            OR: [
              { statusCode: { lt: 200 } },
              { statusCode: { gte: 300 } },
              { statusCode: 0 },
            ],
          },
        }),
      ]);
      return {
        metric: query.metric,
        windowMinutes: query.windowMinutes,
        total,
        errors,
        errorRatePercent: total === 0 ? 0 : Number(((errors / total) * 100).toFixed(2)),
      };
    }
    case 'list_recent': {
      const rows = await prisma.response.findMany({
        where,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: query.limit ?? 10,
        select: {
          id: true,
          timestamp: true,
          statusCode: true,
          responseTimeMs: true,
          errorMessage: true,
          requestPayload: true,
          responseBody: true,
        },
      });
      return {
        metric: query.metric,
        windowMinutes: query.windowMinutes,
        items: rows.map((row) => ({
          id: row.id,
          timestamp: row.timestamp.toISOString(),
          statusCode: row.statusCode,
          responseTimeMs: row.responseTimeMs,
          errorMessage: row.errorMessage,
          isSuccess: isSuccess(row.statusCode),
          ...payloadSnippet(row.requestPayload, row.responseBody),
        })),
      };
    }
    case 'list_slowest': {
      const rows = await prisma.response.findMany({
        where,
        orderBy: { responseTimeMs: 'desc' },
        take: query.limit ?? 10,
        select: {
          id: true,
          timestamp: true,
          statusCode: true,
          responseTimeMs: true,
          errorMessage: true,
          requestPayload: true,
          responseBody: true,
        },
      });
      return {
        metric: query.metric,
        windowMinutes: query.windowMinutes,
        items: rows.map((row) => ({
          id: row.id,
          timestamp: row.timestamp.toISOString(),
          statusCode: row.statusCode,
          responseTimeMs: row.responseTimeMs,
          errorMessage: row.errorMessage,
          isSuccess: isSuccess(row.statusCode),
          ...payloadSnippet(row.requestPayload, row.responseBody),
        })),
      };
    }
    default:
      throw new Error(`Unsupported metric: ${String(query.metric)}`);
  }
}
