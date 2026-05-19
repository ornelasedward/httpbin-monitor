import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const HEALTH_REFETCH_MS = 30_000;

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    refetchInterval: HEALTH_REFETCH_MS,
  });
}
