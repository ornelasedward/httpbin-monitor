import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

vi.mock('@/components/ResponsesTable', () => ({
  ResponsesTable: () => <div data-testid="responses-table" />,
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
    data: { total: 151, avgResponseTime: 248, errorRate: 1.3 },
    isLoading: false,
    isError: false,
  }),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  it('renders server-backed stat cards from GET /stats', () => {
    renderDashboard();

    expect(screen.getByText('151')).toBeInTheDocument();
    expect(screen.getByText('248ms')).toBeInTheDocument();
    expect(screen.getByText('1.3%')).toBeInTheDocument();
  });

  it('renders API health and the responses table', () => {
    renderDashboard();

    expect(screen.getByText('API: healthy')).toBeInTheDocument();
    expect(screen.getByTestId('responses-table')).toBeInTheDocument();
  });
});
