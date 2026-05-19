import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InfiniteData } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Incident, ResponseRecord } from '@httpbin-monitor/shared';
import { ResponsesTable } from './ResponsesTable';
import type { IncidentsPage, ResponsesPage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

vi.mock('@/hooks/useResponses', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useResponses')>('@/hooks/useResponses');
  return {
    ...actual,
    useResponses: vi.fn(),
  };
});

vi.mock('@/hooks/useIncidents', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useIncidents')>('@/hooks/useIncidents');
  return {
    ...actual,
    useIncidents: vi.fn(),
  };
});

import { useIncidents } from '@/hooks/useIncidents';
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

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-1',
    responseId: 'rec-1',
    severity: 'high',
    summary: 'Slow response detected',
    rootCauses: {
      rootCauses: ['Upstream latency'],
      recommendations: ['Increase timeout'],
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeIncidentsInfiniteData(items: Incident[]): InfiniteData<IncidentsPage> {
  return {
    pages: [{ items, nextCursor: null }],
    pageParams: [undefined],
  };
}

const mockedUseResponses = vi.mocked(useResponses);
const mockedUseIncidents = vi.mocked(useIncidents);

function mockUseIncidentsResult(
  data: InfiniteData<IncidentsPage>,
): ReturnType<typeof useIncidents> {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useIncidents>;
}

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
    mockedUseIncidents.mockReturnValue(mockUseIncidentsResult(makeIncidentsInfiniteData([])));
  });

  it('renders rows from query data with correct columns', () => {
    mockedUseResponses.mockReturnValue(
      mockUseResponsesResult(makeInfiniteData([makeRecord({ id: 'row-a' })])),
    );

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

    expect(screen.getByText('200').closest('[data-status-code="200"]')).toHaveClass(
      'bg-status-success',
    );
    expect(screen.getByText('404').closest('[data-status-code="404"]')).toHaveClass(
      'bg-status-warn',
    );
    expect(screen.getByText('503').closest('[data-status-code="503"]')).toHaveClass(
      'bg-status-error',
    );
    expect(screen.getByText('Network error').closest('[data-status-code="0"]')).toHaveClass(
      'bg-status-neutral',
    );
    expect(screen.getAllByRole('button', { name: 'View details' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'View payload' })).toBeInTheDocument();
  });

  it('styles response time over 3000ms in red', () => {
    mockedUseResponses.mockReturnValue(
      mockUseResponsesResult(makeInfiniteData([makeRecord({ responseTimeMs: 3500 })])),
    );

    renderWithClient();

    expect(screen.getByText('3500ms')).toHaveClass('text-status-error-fg');
  });

  it('renders empty state when there are no items', () => {
    mockedUseResponses.mockReturnValue(mockUseResponsesResult(makeInfiniteData([])));

    renderWithClient();

    expect(screen.getByText(/Waiting for the first ping/i)).toBeInTheDocument();
  });

  it('opens the sheet with incident details when response is linked', async () => {
    const user = userEvent.setup();
    mockedUseResponses.mockReturnValue(
      mockUseResponsesResult(makeInfiniteData([makeRecord({ id: 'rec-1' })])),
    );
    mockedUseIncidents.mockReturnValue(
      mockUseIncidentsResult(makeIncidentsInfiniteData([makeIncident({ responseId: 'rec-1' })])),
    );

    renderWithClient();

    await user.click(screen.getByRole('button', { name: 'View details' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Slow response detected')).toBeInTheDocument();
    expect(within(dialog).getByText('Upstream latency')).toBeInTheDocument();
    expect(within(dialog).getByText(/"hello": "world"/)).toBeInTheDocument();
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
