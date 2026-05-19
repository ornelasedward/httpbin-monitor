import { ResponsesTable } from '@/components/ResponsesTable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useHealth } from '@/hooks/useHealth';

export function Dashboard() {
  const { data: healthy, isLoading: healthLoading, isError: healthError } = useHealth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  const healthBadge =
    healthLoading ? (
      <Badge variant="secondary">Checking…</Badge>
    ) : healthError || healthy === false ? (
      <Badge variant="danger">API: unreachable</Badge>
    ) : (
      <Badge variant="success">API: healthy</Badge>
    );

  const total = stats?.total ?? 0;
  const avgResponseTime = stats?.avgResponseTime ?? 0;
  const errorRate = stats?.errorRate ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">API status</span>
          {healthBadge}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total pings (last hour)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">
              {statsLoading ? '…' : total}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-primary/25">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg response time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">
              {statsLoading ? '…' : `${avgResponseTime}ms`}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-destructive/35">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Error rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">
              {statsLoading ? '…' : `${errorRate.toFixed(1)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      <ResponsesTable />
    </div>
  );
}
