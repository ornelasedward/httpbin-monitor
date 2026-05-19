import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('@/hooks/useSocket', () => ({
  useLiveResponses: vi.fn(),
  useLiveIncidents: vi.fn(),
}));

vi.mock('@/hooks/useResponses', () => ({
  useResponses: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
  }),
  flattenPages: () => [],
}));

vi.mock('@/hooks/useHealth', () => ({
  useHealth: () => ({
    data: true,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useDashboardStats', () => ({
  useDashboardStats: () => ({
    data: { total: 0, avgResponseTime: 0, errorRate: 0 },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useAiUsage', () => ({
  useAiUsage: () => ({
    configured: true,
    used: 0,
    max: 20,
    resetAt: null,
    estimatedCostUsd: 0,
  }),
}));

vi.mock('@/components/ChatPanel', () => ({
  ChatPanel: () => null,
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('renders dashboard navigation and monitor heading', () => {
    renderApp();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
});
