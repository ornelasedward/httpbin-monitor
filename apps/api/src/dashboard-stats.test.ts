import { describe, expect, it } from 'vitest';
import { computeDashboardStats } from './dashboard-stats.js';

describe('computeDashboardStats', () => {
  it('returns zeros for an empty list', () => {
    expect(computeDashboardStats([])).toEqual({
      total: 0,
      avgResponseTime: 0,
      errorRate: 0,
    });
  });

  it('averages only successful responses and computes error rate', () => {
    expect(
      computeDashboardStats([
        { statusCode: 200, responseTimeMs: 100 },
        { statusCode: 200, responseTimeMs: 300 },
        { statusCode: 503, responseTimeMs: 900 },
        { statusCode: 0, responseTimeMs: 0 },
      ]),
    ).toEqual({
      total: 4,
      avgResponseTime: 200,
      errorRate: 50,
    });
  });
});
