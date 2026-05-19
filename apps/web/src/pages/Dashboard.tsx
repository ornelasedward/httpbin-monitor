import { useMemo } from 'react';
import type { ResponseRecord } from '@httpbin-monitor/shared';
import { ChatPanel } from '@/components/ChatPanel';
import { ResponsesTable } from '@/components/ResponsesTable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { flattenPages, useResponses } from '@/hooks/useResponses';
import { useHealth } from '@/hooks/useHealth';

const ONE_HOUR_MS = 60 * 60 * 1000;

function isSuccess(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

function computeStats(rows: ResponseRecord[]) {
  const now = Date.now();
  const lastHour = rows.filter((row) => now - new Date(row.timestamp).getTime() <= ONE_HOUR_MS);
  const total = lastHour.length;
  const successes = lastHour.filter((row) => isSuccess(row.statusCode));
  const avgResponseTime =
    successes.length > 0
      ? Math.round(
          successes.reduce((sum, row) => sum + row.responseTimeMs, 0) / successes.length,
        )
      : 0;
  const errorRate = total > 0 ? ((total - successes.length) / total) * 100 : 0;

  return { total, avgResponseTime, errorRate };
}

export function Dashboard() {
  const { data: healthy, isLoading: healthLoading, isError: healthError } = useHealth();
  const { data } = useResponses();

  const stats = useMemo(() => computeStats(flattenPages(data)), [data]);

  const healthBadge =
    healthLoading ? (
      <Badge variant="secondary">Checking…</Badge>
    ) : healthError || healthy === false ? (
      <Badge variant="danger">API: unreachable</Badge>
    ) : (
      <Badge variant="success">API: healthy</Badge>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">HTTP Monitor</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">API status</span>
          {healthBadge}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total pings (last hour)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg response time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.avgResponseTime}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Error rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.errorRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <ResponsesTable />
      <ChatPanel />
    </div>
  );
}
