import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { Incident } from '@httpbin-monitor/shared';
import { fetchIncidents, type IncidentsPage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function incidentsInfiniteQueryOptions() {
  return {
    queryKey: queryKeys.incidents.all,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchIncidents({ limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: IncidentsPage) => last.nextCursor ?? undefined,
  };
}

export function useIncidents() {
  return useInfiniteQuery(incidentsInfiniteQueryOptions());
}

export function flattenIncidentPages(data: InfiniteData<IncidentsPage> | undefined): Incident[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page.items);
}
