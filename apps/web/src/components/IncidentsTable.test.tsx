import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InfiniteData } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Incident, ResponseRecord } from '@httpbin-monitor/shared';
import { IncidentsTable } from './IncidentsTable';
import type { IncidentsPage } from '@/lib/api';

vi.mock('@/hooks/useIncidents', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useIncidents')>('@/hooks/useIncidents');
  return {
    ...actual,
    useIncidents: vi.fn(),
  };
});

vi.mock('@/hooks/useResponse', () => ({
  useResponse: vi.fn(),
}));

import { useIncidents } from '@/hooks/useIncidents';
import { useResponse } from '@/hooks/useResponse';

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

function makeRecord(overrides: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    id: 'rec-1',
    timestamp: new Date().toISOString(),
    statusCode: 200,
    responseTimeMs: 3500,
    requestPayload: { ping: true },
    responseBody: { ok: true },
    errorMessage: null,
    ...overrides,
  };
}

function makeIncidentsInfiniteData(items: Incident[]): InfiniteData<IncidentsPage> {
  return {
    pages: [{ items, nextCursor: null }],
    pageParams: [undefined],
  };
}

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IncidentsTable />
    </QueryClientProvider>,
  );
}

const mockedUseIncidents = vi.mocked(useIncidents);
const mockedUseResponse = vi.mocked(useResponse);

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

function mockUseResponseResult(
  data: ResponseRecord | undefined,
  overrides: Partial<ReturnType<typeof useResponse>> = {},
): ReturnType<typeof useResponse> {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useResponse>;
}

describe('IncidentsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseResponse.mockReturnValue(mockUseResponseResult(undefined));
  });

  it('renders table rows with severity and summary', () => {
    mockedUseIncidents.mockReturnValue(
      mockUseIncidentsResult(makeIncidentsInfiniteData([makeIncident()])),
    );

    renderWithClient();

    expect(screen.getByRole('columnheader', { name: 'Severity' })).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('Slow response detected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument();
  });

  it('renders empty state when there are no incidents', () => {
    mockedUseIncidents.mockReturnValue(mockUseIncidentsResult(makeIncidentsInfiniteData([])));

    renderWithClient();

    expect(screen.getByText(/No incidents yet/i)).toBeInTheDocument();
  });

  it('opens the sheet with root causes and fetches related response JSON', async () => {
    const user = userEvent.setup();
    mockedUseIncidents.mockReturnValue(
      mockUseIncidentsResult(makeIncidentsInfiniteData([makeIncident()])),
    );
    mockedUseResponse.mockReturnValue(mockUseResponseResult(makeRecord()));

    renderWithClient();

    await user.click(screen.getByRole('button', { name: 'View details' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/httpbin\.org\/anything/)).toBeInTheDocument();
    expect(within(dialog).getByText('Upstream latency')).toBeInTheDocument();
    expect(within(dialog).getByText('Increase timeout')).toBeInTheDocument();
    expect(within(dialog).getByText(/"ping": true/)).toBeInTheDocument();
    expect(mockedUseResponse).toHaveBeenCalledWith('rec-1');
  });
});
