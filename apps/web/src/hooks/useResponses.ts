import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { ResponseRecord } from '@httpbin-monitor/shared';
import { fetchResponses, type ResponsesPage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function responsesInfiniteQueryOptions() {
  return {
    queryKey: queryKeys.responses.all,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchResponses({ limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ResponsesPage) => last.nextCursor ?? undefined,
  };
}

export function useResponses() {
  return useInfiniteQuery(responsesInfiniteQueryOptions());
}

export function flattenPages(data: InfiniteData<ResponsesPage> | undefined): ResponseRecord[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page.items);
}
