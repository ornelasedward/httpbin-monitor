import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResponseRecord } from '@httpbin-monitor/shared';
import { PING_NEW } from '@httpbin-monitor/shared';
import { SocketProvider } from '@/context/SocketProvider';
import { queryKeys } from '@/lib/query-keys';
import { useLiveResponses } from '@/hooks/useSocket';

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
});
