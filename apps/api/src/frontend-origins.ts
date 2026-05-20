const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'] as const;

/** Strip trailing slashes so env URLs match browser Origin headers. */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function resolveFrontendOrigins(): string[] {
  const raw = process.env.FRONTEND_ORIGIN?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean);
  }

  if (process.env.NODE_ENV === 'production') {
    return [];
  }

  return [...DEFAULT_DEV_ORIGINS];
}
