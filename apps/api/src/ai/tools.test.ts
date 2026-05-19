import { describe, expect, it, vi } from 'vitest';
import { executeQueryResponses, validateQueryResponsesInput } from './tools.js';

function createMockPrisma(
  rows: Array<{
    id: string;
    timestamp: Date;
    statusCode: number;
    responseTimeMs: number;
    errorMessage?: string | null;
  }>,
) {
  return {
    response: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        return rows.filter((row) => matchesWhere(row, where)).length;
      }),
      aggregate: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        const filtered = rows.filter((row) => matchesWhere(row, where));
        const avg =
          filtered.length === 0
            ? 0
            : filtered.reduce((sum, row) => sum + row.responseTimeMs, 0) / filtered.length;
        return { _avg: { responseTimeMs: avg } };
      }),
      findMany: vi.fn(
        async ({
          where,
          orderBy,
          take,
          select,
        }: {
          where?: Record<string, unknown>;
          orderBy?: unknown;
          take?: number;
          select?: Record<string, boolean>;
        }) => {
          let filtered = rows.filter((row) => matchesWhere(row, where));
          if (orderBy && typeof orderBy === 'object' && 'responseTimeMs' in (orderBy as object)) {
            filtered = [...filtered].sort((a, b) => b.responseTimeMs - a.responseTimeMs);
          } else {
            filtered = [...filtered].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          }
          const sliced = filtered.slice(0, take ?? filtered.length);
          if (!select) return sliced;
          return sliced.map((row) => ({
            id: row.id,
            timestamp: row.timestamp,
            statusCode: row.statusCode,
            responseTimeMs: row.responseTimeMs,
            errorMessage: row.errorMessage ?? null,
          }));
        },
      ),
    },
  };
}

function matchesWhere(
  row: { timestamp: Date; statusCode: number },
  where?: Record<string, unknown>,
): boolean {
  if (!where) return true;
  const timestampWhere = where.timestamp as { gte?: Date } | undefined;
  if (timestampWhere?.gte && row.timestamp < timestampWhere.gte) return false;

  const statusCodeWhere = where.statusCode as { gte?: number; lt?: number } | number | undefined;
  if (typeof statusCodeWhere === 'object' && statusCodeWhere) {
    if (statusCodeWhere.gte !== undefined && row.statusCode < statusCodeWhere.gte) return false;
    if (statusCodeWhere.lt !== undefined && row.statusCode >= statusCodeWhere.lt) return false;
  }
  if (typeof statusCodeWhere === 'number' && row.statusCode !== statusCodeWhere) return false;

  const orClause = where.OR as Array<Record<string, unknown>> | undefined;
  if (orClause) {
    return orClause.some((clause) => matchesWhere(row, clause));
  }

  return true;
}

describe('validateQueryResponsesInput', () => {
  it('rejects unknown metrics', () => {
    expect(() => validateQueryResponsesInput({ metric: 'unknown', windowMinutes: 10 })).toThrow(
      /Invalid metric/,
    );
  });

  it('rejects out-of-range windowMinutes', () => {
    expect(() => validateQueryResponsesInput({ metric: 'count', windowMinutes: 0 })).toThrow(
      /windowMinutes/,
    );
  });
});

describe('executeQueryResponses', () => {
  const now = new Date();
  const rows = [
    { id: '1', timestamp: now, statusCode: 200, responseTimeMs: 100 },
    { id: '2', timestamp: now, statusCode: 404, responseTimeMs: 300 },
    { id: '3', timestamp: now, statusCode: 503, responseTimeMs: 5000 },
  ];

  it('returns count for count metric', async () => {
    const prisma = createMockPrisma(rows);
    const result = await executeQueryResponses(
      { metric: 'count', windowMinutes: 60 },
      prisma as never,
    );
    expect(result).toMatchObject({ count: 3 });
  });

  it('computes error_rate correctly', async () => {
    const prisma = createMockPrisma(rows);
    const result = await executeQueryResponses(
      { metric: 'error_rate', windowMinutes: 60 },
      prisma as never,
    );
    expect(result).toMatchObject({
      total: 3,
      errors: 2,
      errorRatePercent: 66.67,
    });
  });

  it('respects list_slowest limit', async () => {
    const prisma = createMockPrisma(rows);
    const result = await executeQueryResponses(
      { metric: 'list_slowest', windowMinutes: 60, limit: 2 },
      prisma as never,
    );
    expect(result.items).toHaveLength(2);
    expect((result.items as Array<{ responseTimeMs: number }>)[0]?.responseTimeMs).toBe(5000);
  });
});
