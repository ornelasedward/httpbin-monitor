import { afterEach, describe, expect, it } from 'vitest';
import { resolveFrontendOrigins } from './frontend-origins.js';

describe('resolveFrontendOrigins', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('allows both Vite dev ports when unset outside production', () => {
    delete process.env.FRONTEND_ORIGIN;
    process.env.NODE_ENV = 'development';

    expect(resolveFrontendOrigins()).toEqual(['http://localhost:5173', 'http://localhost:5174']);
  });

  it('parses comma-separated origins from env', () => {
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173, http://localhost:5174';

    expect(resolveFrontendOrigins()).toEqual(['http://localhost:5173', 'http://localhost:5174']);
  });

  it('strips trailing slashes from configured origins', () => {
    process.env.FRONTEND_ORIGIN = 'https://web-production-9ea3e.up.railway.app/';

    expect(resolveFrontendOrigins()).toEqual(['https://web-production-9ea3e.up.railway.app']);
  });

  it('returns empty list in production when unset', () => {
    delete process.env.FRONTEND_ORIGIN;
    process.env.NODE_ENV = 'production';

    expect(resolveFrontendOrigins()).toEqual([]);
  });
});
