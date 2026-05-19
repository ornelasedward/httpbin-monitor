import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.stats.dashboard,
    queryFn: fetchDashboardStats,
    refetchInterval: 30_000,
  });
}
