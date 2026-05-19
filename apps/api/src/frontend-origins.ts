const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'] as const;

export function resolveFrontendOrigins(): string[] {
  const raw = process.env.FRONTEND_ORIGIN?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  if (process.env.NODE_ENV === 'production') {
    return [];
  }

  return [...DEFAULT_DEV_ORIGINS];
}
