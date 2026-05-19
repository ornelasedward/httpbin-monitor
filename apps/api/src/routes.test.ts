import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { ResponseRecord } from '@httpbin-monitor/shared';
import { createAICache } from './ai/cache.js';
import { createAILimiter } from './ai/limiter.js';
import type { AIServices } from './ai/services.js';
import { errorHandler } from './error-handler.js';
import { createRoutes, type ResponsesRepository } from './routes.js';

function makeRow(
  id: string,
  timestamp: string,
  overrides: Omit<Partial<ResponseRecord>, 'timestamp'> = {},
): {
  id: string;
  timestamp: Date;
  statusCode: number;
  responseTimeMs: number;
  requestPayload: unknown;
  responseBody: unknown;
  errorMessage: string | null;
} {
  return {
    id,
    timestamp: new Date(timestamp),
    statusCode: 200,
    responseTimeMs: 100,
    requestPayload: {},
    responseBody: {},
    errorMessage: null,
    ...overrides,
  };
}

function createInMemoryRepo(rows: Array<ReturnType<typeof makeRow>>): ResponsesRepository {
  const sorted = () =>
    [...rows].sort((a, b) => {
      const byTimestamp = b.timestamp.getTime() - a.timestamp.getTime();
      if (byTimestamp !== 0) return byTimestamp;
      return b.id.localeCompare(a.id);
    });

  return {
    findMany: async ({ take, cursor, skip }) => {
      let list = sorted();
      if (cursor?.id) {
        const index = list.findIndex((row) => row.id === cursor.id);
        if (index >= 0) {
          list = list.slice(index + (skip ?? 0));
        }
      }
      return list.slice(0, take);
    },
  };
}

function createMockAi(used = 0): AIServices {
  const limiter = createAILimiter(20);
  for (let index = 0; index < used; index += 1) {
    limiter.tryAcquire();
  }
  return {
    enabled: true,
    ai: {} as AIServices['ai'],
    cache: createAICache(3600),
    limiter,
  };
}

function createApp(
  repo: ResponsesRepository,
  options?: { ai?: AIServices | null },
) {
  const app = express();
  app.use(express.json());
  app.use(createRoutes({ responsesRepo: repo, ai: options?.ai }));
  app.use(errorHandler);
  return app;
}

describe('GET /responses', () => {
  it('returns empty page when there are no rows', async () => {
    const app = createApp(createInMemoryRepo([]));
    const res = await request(app).get('/responses');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('returns first page and nextCursor for 75 rows with limit=50', async () => {
    const rows = Array.from({ length: 75 }, (_, index) =>
      makeRow(`row_${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, 75 - index)).toISOString()),
    );
    const app = createApp(createInMemoryRepo(rows));

    const res = await request(app).get('/responses?limit=50');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.nextCursor).toBe(res.body.items[49].id);
  });

  it('returns remaining rows when cursor is provided', async () => {
    const rows = Array.from({ length: 75 }, (_, index) =>
      makeRow(`row_${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, 75 - index)).toISOString()),
    );
    const app = createApp(createInMemoryRepo(rows));

    const firstPage = await request(app).get('/responses?limit=50');
    const secondPage = await request(app).get(
      `/responses?limit=50&cursor=${firstPage.body.nextCursor}`,
    );

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(25);
    expect(secondPage.body.nextCursor).toBeNull();
  });

  it('clamps limit to 200', async () => {
    const rows = Array.from({ length: 250 }, (_, index) =>
      makeRow(`row_${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, 250 - index)).toISOString()),
    );
    const app = createApp(createInMemoryRepo(rows));

    const res = await request(app).get('/responses?limit=999');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(200);
    expect(res.body.nextCursor).not.toBeNull();
  });
});

describe('GET /responses errors', () => {
  it('returns 500 JSON when the repository fails', async () => {
    const failingRepo: ResponsesRepository = {
      findMany: vi.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const app = createApp(failingRepo);
    const res = await request(app).get('/responses');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'database unavailable' });
  });
});

describe('POST /ai/chat validation', () => {
  it('returns 400 when messages are missing or invalid', async () => {
    const app = createApp(createInMemoryRepo([]), { ai: createMockAi() });
    const res = await request(app).post('/ai/chat').send({ messages: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid messages');
  });
});

describe('GET /ai/usage', () => {
  it('returns configured:false when AI is not set up', async () => {
    const app = createApp(createInMemoryRepo([]), { ai: null });
    const res = await request(app).get('/ai/usage');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      used: 0,
      max: 0,
      resetAt: null,
      estimatedCostUsd: 0,
      configured: false,
    });
  });

  it('returns limiter usage and cost estimate when AI is configured', async () => {
    const app = createApp(createInMemoryRepo([]), { ai: createMockAi(3) });
    const res = await request(app).get('/ai/usage');

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.used).toBe(3);
    expect(res.body.max).toBe(20);
    expect(res.body.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.estimatedCostUsd).toBeGreaterThan(0);
    expect(res.body.pricingNote).toContain('Haiku');
  });
});
