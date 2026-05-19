export const queryKeys = {
  responses: {
    all: ['responses'] as const,
    detail: (id: string) => ['responses', id] as const,
  },
  incidents: {
    all: ['incidents'] as const,
  },
  health: ['health'] as const,
  stats: {
    dashboard: ['stats', 'dashboard'] as const,
  },
} as const;
