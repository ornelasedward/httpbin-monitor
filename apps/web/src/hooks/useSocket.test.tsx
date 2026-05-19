import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResponseRecord } from '@httpbin-monitor/shared';
import { INCIDENT_NEW, PING_NEW, type Incident } from '@httpbin-monitor/shared';
import { SocketProvider } from '@/context/SocketProvider';
import { queryKeys } from '@/lib/query-keys';
import { useLiveIncidents, useLiveResponses } from '@/hooks/useSocket';

const handlers: Record<string, (payload: unknown) => void> = {};

const mockSocket = {
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    handlers[event] = handler;
  }),
  off: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

function makeRecord(id: string): ResponseRecord {
  return {
    id,
    timestamp: '2026-05-19T12:00:00.000Z',
    statusCode: 200,
    responseTimeMs: 100,
    requestPayload: {},
    responseBody: {},
    errorMessage: null,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SocketProvider>{children}</SocketProvider>
      </QueryClientProvider>
    );
  };
}

describe('useLiveResponses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it('prepends a new ping to the responses cache and dedupes by id', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.responses.all, {
      pages: [{ items: [makeRecord('existing')], nextCursor: null }],
      pageParams: [undefined],
    });

    renderHook(() => useLiveResponses(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(handlers[PING_NEW]).toBeDefined();
    });

    const live = makeRecord('live-1');
    handlers[PING_NEW]!(live);
    handlers[PING_NEW]!(live);

    const data = queryClient.getQueryData<{
      pages: Array<{ items: ResponseRecord[] }>;
    }>(queryKeys.responses.all);

    expect(data?.pages[0]?.items.map((row) => row.id)).toEqual(['live-1', 'existing']);
  });

  it('invalidates dashboard stats when a new ping arrives', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useLiveResponses(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(handlers[PING_NEW]).toBeDefined();
    });

    handlers[PING_NEW]!(makeRecord('live-stats'));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.stats.dashboard,
    });
  });
});

function makeIncident(id: string): Incident {
  return {
    id,
    responseId: `rec-${id}`,
    severity: 'low',
    summary: 'Test incident',
    rootCauses: { rootCauses: ['test'], recommendations: [] },
    createdAt: '2026-05-19T12:00:00.000Z',
  };
}

describe('useLiveIncidents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it('prepends a new incident to the incidents cache and dedupes by id', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.incidents.all, {
      pages: [{ items: [makeIncident('existing')], nextCursor: null }],
      pageParams: [undefined],
    });

    renderHook(() => useLiveIncidents(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(handlers[INCIDENT_NEW]).toBeDefined();
    });

    const live = makeIncident('live-1');
    handlers[INCIDENT_NEW]!(live);
    handlers[INCIDENT_NEW]!(live);

    const data = queryClient.getQueryData<{
      pages: Array<{ items: Incident[] }>;
    }>(queryKeys.incidents.all);

    expect(data?.pages[0]?.items.map((row) => row.id)).toEqual(['live-1', 'existing']);
  });
});
