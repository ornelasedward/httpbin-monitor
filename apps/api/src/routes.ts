import { Router, type Request, type Response } from 'express';
import type { ChatMessage, Incident, ResponseRecord } from '@httpbin-monitor/shared';
import { prisma } from './db.js';
import { toResponseRecord } from './response-mapper.js';
import { toIncident } from './incident-mapper.js';
import type { AIServices } from './ai/services.js';
import { estimateCostUsd, HAIKU_INPUT_USD_PER_M, HAIKU_OUTPUT_USD_PER_M } from './ai/services.js';
import { handleChatStream } from './ai/chat.js';
import { initSse, writeSse } from './ai/sse.js';
import { asyncHandler, HttpError } from './error-handler.js';
import { computeDashboardStats, ONE_HOUR_MS } from './dashboard-stats.js';

export type ResponsesRepository = {
  findMany: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<
    Array<{
      id: string;
      timestamp: Date;
      statusCode: number;
      responseTimeMs: number;
      requestPayload: unknown;
      responseBody: unknown;
      errorMessage: string | null;
    }>
  >;
  findById: (id: string) => Promise<{
    id: string;
    timestamp: Date;
    statusCode: number;
    responseTimeMs: number;
    requestPayload: unknown;
    responseBody: unknown;
    errorMessage: string | null;
  } | null>;
};

export type StatsRepository = {
  findLastHour: () => Promise<Array<{ statusCode: number; responseTimeMs: number }>>;
};

export type IncidentsRepository = {
  findMany: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<
    Array<{
      id: string;
      responseId: string;
      severity: string;
      summary: string;
      rootCauses: unknown;
      createdAt: Date;
    }>
  >;
};

function parseLimit(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? '50'), 10);
  if (Number.isNaN(parsed)) return 50;
  return Math.min(200, Math.max(1, parsed));
}

const MAX_CHAT_MESSAGES = 50;
const MAX_CHAT_CONTENT_LENGTH = 10_000;

function parseChatMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CHAT_MESSAGES) {
    return null;
  }

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const message = entry as Record<string, unknown>;
    if (message.role !== 'user' && message.role !== 'assistant') return null;
    if (typeof message.content !== 'string') return null;
    if (message.content.length > MAX_CHAT_CONTENT_LENGTH) return null;
  }

  return raw as ChatMessage[];
}

export function createRoutes(deps?: {
  responsesRepo?: ResponsesRepository;
  incidentsRepo?: IncidentsRepository;
  statsRepo?: StatsRepository;
  ai?: AIServices | null;
}) {
  const router = Router();
  const responsesRepo =
    deps?.responsesRepo ??
    ({
      findMany: (args) =>
        prisma.response.findMany({
          ...args,
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        }),
      findById: (id) => prisma.response.findUnique({ where: { id } }),
    } satisfies ResponsesRepository);

  const incidentsRepo =
    deps?.incidentsRepo ??
    ({
      findMany: (args) =>
        prisma.incident.findMany({
          ...args,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
    } satisfies IncidentsRepository);

  const statsRepo =
    deps?.statsRepo ??
    ({
      findLastHour: () =>
        prisma.response.findMany({
          where: { timestamp: { gte: new Date(Date.now() - ONE_HOUR_MS) } },
          select: { statusCode: true, responseTimeMs: true },
        }),
    } satisfies StatsRepository);

  const ai = deps?.ai ?? null;

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get(
    '/stats',
    asyncHandler(async (_req: Request, res: Response) => {
      const rows = await statsRepo.findLastHour();
      res.json(computeDashboardStats(rows));
    }),
  );

  router.get(
    '/responses',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req.query.limit);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

      const rows = await responsesRepo.findMany({
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const items: ResponseRecord[] = pageRows.map(toResponseRecord);
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      res.json({ items, nextCursor });
    }),
  );

  router.get(
    '/responses/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const row = await responsesRepo.findById(id);
      if (!row) {
        throw new HttpError(404, 'Response not found');
      }
      res.json(toResponseRecord(row));
    }),
  );

  router.get(
    '/incidents',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req.query.limit);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

      const rows = await incidentsRepo.findMany({
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const items: Incident[] = pageRows.map(toIncident);
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      res.json({ items, nextCursor });
    }),
  );

  router.get('/ai/usage', (_req, res) => {
    if (!ai) {
      res.json({
        used: 0,
        max: 0,
        resetAt: null,
        estimatedCostUsd: 0,
        configured: false,
      });
      return;
    }

    const usage = ai.limiter.getUsage();
    res.json({
      used: usage.used,
      max: usage.max,
      resetAt: usage.resetAt.toISOString(),
      estimatedCostUsd: estimateCostUsd(usage.used * 500, usage.used * 300),
      configured: true,
      pricingNote: `Estimates use Haiku list rates ($${HAIKU_INPUT_USD_PER_M}/M in, $${HAIKU_OUTPUT_USD_PER_M}/M out).`,
    });
  });

  router.post('/ai/chat', async (req: Request, res: Response) => {
    if (!ai) {
      res.status(503).json({ error: 'AI features not configured' });
      return;
    }

    const messages = parseChatMessages(req.body?.messages);
    if (!messages) {
      res
        .status(400)
        .json({ error: 'Invalid messages: expected a non-empty array of chat messages' });
      return;
    }

    initSse(res);

    try {
      for await (const event of handleChatStream(
        { ai: ai.ai, cache: ai.cache, limiter: ai.limiter, prisma },
        messages,
      )) {
        if (event.type === 'token') {
          writeSse(res, 'token', { text: event.text ?? '' });
        } else if (event.type === 'cached') {
          writeSse(res, 'cached', {});
        } else if (event.type === 'error') {
          writeSse(res, 'error', { message: event.text ?? 'Unknown error' });
        } else if (event.type === 'done') {
          writeSse(res, 'done', { usage: event.usage ?? {} });
        }
      }
    } catch (err) {
      writeSse(res, 'error', {
        message: err instanceof Error ? err.message : 'Chat stream failed',
      });
    }

    res.end();
  });

  return router;
}
