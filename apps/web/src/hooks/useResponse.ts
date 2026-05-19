import { useQuery } from '@tanstack/react-query';
import { fetchResponse } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useResponse(responseId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.responses.detail(responseId ?? ''),
    queryFn: () => fetchResponse(responseId!),
    enabled: Boolean(responseId),
    staleTime: 60_000,
  });
}
