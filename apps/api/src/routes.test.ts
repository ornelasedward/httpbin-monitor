import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { ResponseRecord } from '@httpbin-monitor/shared';
import { createAICache } from './ai/cache.js';
import { createAILimiter } from './ai/limiter.js';
import type { AIServices } from './ai/services.js';
import { errorHandler } from './error-handler.js';
import {
  createRoutes,
  type IncidentsRepository,
  type ResponsesRepository,
  type StatsRepository,
} from './routes.js';

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
    findById: async (id) => rows.find((row) => row.id === id) ?? null,
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

function createInMemoryIncidentsRepo(
  rows: Array<{
    id: string;
    responseId: string;
    severity: string;
    summary: string;
    rootCauses: unknown;
    createdAt: Date;
  }>,
): IncidentsRepository {
  const sorted = () =>
    [...rows].sort((a, b) => {
      const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
      if (byCreated !== 0) return byCreated;
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

function createStatsRepo(rows: Array<ReturnType<typeof makeRow>>): StatsRepository {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return {
    findLastHour: async () =>
      rows
        .filter((row) => row.timestamp.getTime() >= hourAgo)
        .map((row) => ({ statusCode: row.statusCode, responseTimeMs: row.responseTimeMs })),
  };
}

function createApp(
  repo: ResponsesRepository,
  options?: {
    ai?: AIServices | null;
    statsRepo?: StatsRepository;
    incidentsRepo?: IncidentsRepository;
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    createRoutes({
      responsesRepo: repo,
      statsRepo: options?.statsRepo,
      incidentsRepo: options?.incidentsRepo,
      ai: options?.ai,
    }),
  );
  app.use(errorHandler);
  return app;
}

describe('GET /stats', () => {
  it('returns zeros when there are no rows in the last hour', async () => {
    const app = createApp(createInMemoryRepo([]), { statsRepo: createStatsRepo([]) });
    const res = await request(app).get('/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, avgResponseTime: 0, errorRate: 0 });
  });

  it('returns aggregated stats for the last hour', async () => {
    const hourAgo = new Date(Date.now() - 30 * 60 * 1000);
    const rows = [
      makeRow('row_1', hourAgo.toISOString(), { statusCode: 200, responseTimeMs: 100 }),
      makeRow('row_2', hourAgo.toISOString(), { statusCode: 200, responseTimeMs: 300 }),
      makeRow('row_3', hourAgo.toISOString(), { statusCode: 503, responseTimeMs: 900 }),
    ];
    const app = createApp(createInMemoryRepo(rows), { statsRepo: createStatsRepo(rows) });

    const res = await request(app).get('/stats');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.avgResponseTime).toBe(200);
    expect(res.body.errorRate).toBeCloseTo(33.333, 2);
  });

  it('returns 500 when the stats repository fails', async () => {
    const failingStatsRepo: StatsRepository = {
      findLastHour: vi.fn().mockRejectedValue(new Error('stats unavailable')),
    };
    const app = createApp(createInMemoryRepo([]), { statsRepo: failingStatsRepo });
    const res = await request(app).get('/stats');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'stats unavailable' });
  });
});

describe('GET /incidents', () => {
  it('returns paginated incidents', async () => {
    const rows = [
      {
        id: 'inc_2',
        responseId: 'row_2',
        severity: 'high',
        summary: 'Slow response',
        rootCauses: { rootCauses: ['latency'], recommendations: [] },
        createdAt: new Date(Date.UTC(2026, 0, 2)),
      },
      {
        id: 'inc_1',
        responseId: 'row_1',
        severity: 'low',
        summary: 'Older incident',
        rootCauses: { rootCauses: [], recommendations: [] },
        createdAt: new Date(Date.UTC(2026, 0, 1)),
      },
    ];
    const app = createApp(createInMemoryRepo([]), {
      incidentsRepo: createInMemoryIncidentsRepo(rows),
    });

    const res = await request(app).get('/incidents?limit=50');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].id).toBe('inc_2');
    expect(res.body.nextCursor).toBeNull();
  });
});

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

describe('GET /responses/:id', () => {
  it('returns a single response by id', async () => {
    const row = makeRow('row_1', new Date().toISOString(), {
      statusCode: 503,
      responseTimeMs: 900,
      requestPayload: { ping: true },
      responseBody: { error: true },
    });
    const app = createApp(createInMemoryRepo([row]));

    const res = await request(app).get('/responses/row_1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('row_1');
    expect(res.body.statusCode).toBe(503);
    expect(res.body.requestPayload).toEqual({ ping: true });
  });

  it('returns 404 when the response does not exist', async () => {
    const app = createApp(createInMemoryRepo([]));
    const res = await request(app).get('/responses/missing');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Response not found' });
  });
});

describe('GET /responses errors', () => {
  it('returns 500 JSON when the repository fails', async () => {
    const failingRepo: ResponsesRepository = {
      findMany: vi.fn().mockRejectedValue(new Error('database unavailable')),
      findById: vi.fn().mockRejectedValue(new Error('database unavailable')),
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
