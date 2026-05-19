export const ONE_HOUR_MS = 60 * 60 * 1000;

export type DashboardStats = {
  total: number;
  avgResponseTime: number;
  errorRate: number;
};

export type StatsRow = {
  statusCode: number;
  responseTimeMs: number;
};

function isSuccess(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export function computeDashboardStats(rows: StatsRow[]): DashboardStats {
  const total = rows.length;
  const successes = rows.filter((row) => isSuccess(row.statusCode));
  const avgResponseTime =
    successes.length > 0
      ? Math.round(successes.reduce((sum, row) => sum + row.responseTimeMs, 0) / successes.length)
      : 0;
  const errorRate = total > 0 ? ((total - successes.length) / total) * 100 : 0;

  return { total, avgResponseTime, errorRate };
}
