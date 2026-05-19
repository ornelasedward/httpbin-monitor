import { useEffect } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { INCIDENT_NEW, PING_NEW, type Incident, type ResponseRecord } from '@httpbin-monitor/shared';
import { useSocket } from '@/context/SocketProvider';
import type { IncidentsPage, ResponsesPage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export { useSocket } from '@/context/SocketProvider';

export function useLiveResponses(): void {
  const socket = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handler = (record: ResponseRecord) => {
      queryClient.setQueryData<InfiniteData<ResponsesPage>>(queryKeys.responses.all, (old) => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ items: [record], nextCursor: null }],
            pageParams: [undefined],
          };
        }

        const first = old.pages[0]!;
        if (first.items.some((item) => item.id === record.id)) {
          return old;
        }

        return {
          ...old,
          pages: [{ ...first, items: [record, ...first.items] }, ...old.pages.slice(1)],
        };
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats.dashboard });
    };

    socket.on(PING_NEW, handler);
    return () => {
      socket.off(PING_NEW, handler);
    };
  }, [socket, queryClient]);
}

export function useLiveIncidents(): void {
  const socket = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handler = (incident: Incident) => {
      queryClient.setQueryData<InfiniteData<IncidentsPage>>(queryKeys.incidents.all, (old) => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ items: [incident], nextCursor: null }],
            pageParams: [undefined],
          };
        }

        const first = old.pages[0]!;
        if (first.items.some((item) => item.id === incident.id)) {
          return old;
        }

        return {
          ...old,
          pages: [{ ...first, items: [incident, ...first.items] }, ...old.pages.slice(1)],
        };
      });
    };

    socket.on(INCIDENT_NEW, handler);
    return () => {
      socket.off(INCIDENT_NEW, handler);
    };
  }, [socket, queryClient]);
}
