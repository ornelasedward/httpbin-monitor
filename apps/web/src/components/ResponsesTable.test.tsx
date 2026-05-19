import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InfiniteData } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ResponseRecord } from '@httpbin-monitor/shared';
import { ResponsesTable } from './ResponsesTable';
import type { ResponsesPage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

vi.mock('@/hooks/useResponses', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useResponses')>('@/hooks/useResponses');
  return {
    ...actual,
    useResponses: vi.fn(),
  };
});

import { useResponses } from '@/hooks/useResponses';

function makeRecord(overrides: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    id: 'rec-1',
    timestamp: new Date().toISOString(),
    statusCode: 200,
    responseTimeMs: 250,
    requestPayload: { hello: 'world' },
    responseBody: { ok: true },
    errorMessage: null,
    ...overrides,
  };
}

function makeInfiniteData(items: ResponseRecord[]): InfiniteData<ResponsesPage> {
  return {
    pages: [{ items, nextCursor: null }],
    pageParams: [undefined],
  };
}

function renderWithClient(initialData?: InfiniteData<ResponsesPage>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (initialData) {
    queryClient.setQueryData(queryKeys.responses.all, initialData);
  }

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ResponsesTable />
      </QueryClientProvider>,
    ),
  };
}

const mockedUseResponses = vi.mocked(useResponses);

function mockUseResponsesResult(
  data: InfiniteData<ResponsesPage>,
): ReturnType<typeof useResponses> {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useResponses>;
}

describe('ResponsesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rows from query data with correct columns', () => {
    mockedUseResponses.mockReturnValue(mockUseResponsesResult(makeInfiniteData([makeRecord({ id: 'row-a' })])));

    renderWithClient();

    expect(screen.getByRole('columnheader', { name: 'Timestamp' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Response time' })).toBeInTheDocument();
    expect(screen.getByText('250ms')).toBeInTheDocument();
    expect(screen.getByText('httpbin.org/anything')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View payload' })).toBeInTheDocument();
  });

  it('renders status badge colors for 200, 404, 503, and network errors', () => {
    mockedUseResponses.mockReturnValue(
      mockUseResponsesResult(
        makeInfiniteData([
          makeRecord({ id: 'ok', statusCode: 200 }),
          makeRecord({ id: 'nf', statusCode: 404 }),
          makeRecord({ id: 'sv', statusCode: 503 }),
          makeRecord({ id: 'net', statusCode: 0, errorMessage: 'timeout' }),
        ]),
      ),
    );

    renderWithClient();

    expect(screen.getByText('200').closest('[data-status-code="200"]')).toHaveClass('bg-green-100');
    expect(screen.getByText('404').closest('[data-status-code="404"]')).toHaveClass('bg-amber-100');
    expect(screen.getByText('503').closest('[data-status-code="503"]')).toHaveClass('bg-red-100');
    expect(screen.getByText('Network error').closest('[data-status-code="0"]')).toHaveClass(
      'bg-gray-100',
    );
  });

  it('styles response time over 3000ms in red', () => {
    mockedUseResponses.mockReturnValue(
      mockUseResponsesResult(makeInfiniteData([makeRecord({ responseTimeMs: 3500 })])),
    );

    renderWithClient();

    expect(screen.getByText('3500ms')).toHaveClass('text-red-600');
  });

  it('renders empty state when there are no items', () => {
    mockedUseResponses.mockReturnValue(mockUseResponsesResult(makeInfiniteData([])));

    renderWithClient();

    expect(
      screen.getByText(/Waiting for the first ping/i),
    ).toBeInTheDocument();
  });

  it('opens the sheet and shows request payload JSON', async () => {
    const user = userEvent.setup();
    mockedUseResponses.mockReturnValue(
      mockUseResponsesResult(
        makeInfiniteData([
          makeRecord({
            requestPayload: { ping: 'payload' },
            responseBody: { echoed: true },
          }),
        ]),
      ),
    );

    renderWithClient();

    await user.click(screen.getByRole('button', { name: 'View payload' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/"ping": "payload"/)).toBeInTheDocument();
    expect(within(dialog).getByText(/"echoed": true/)).toBeInTheDocument();
  });

  it('prepends a live row when query cache is updated', async () => {
    let currentData = makeInfiniteData([makeRecord({ id: 'existing-row' })]);

    mockedUseResponses.mockImplementation(() => mockUseResponsesResult(currentData));

    const view = renderWithClient(currentData);
    const rows = () => screen.getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(1);

    currentData = makeInfiniteData([
      makeRecord({ id: 'live-row', responseTimeMs: 111 }),
      makeRecord({ id: 'existing-row' }),
    ]);

    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <ResponsesTable />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(rows()[0]).toHaveTextContent('111ms');
      expect(rows()[1]).toHaveTextContent('250ms');
    });
  });
});
