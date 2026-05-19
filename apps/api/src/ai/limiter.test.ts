import { describe, expect, it, vi, afterEach } from 'vitest';
import { createAILimiter } from './limiter.js';

describe('createAILimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to maxPerHour calls', () => {
    let now = 0;
    const limiter = createAILimiter(20, () => now);

    for (let index = 0; index < 20; index += 1) {
      expect(limiter.tryAcquire()).toEqual({ ok: true });
      now += 1000;
    }

    const blocked = limiter.tryAcquire();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.resetAt).toBeInstanceOf(Date);
    }
  });

  it('frees a slot after the oldest timestamp expires', () => {
    let now = 0;
    const limiter = createAILimiter(2, () => now);

    expect(limiter.tryAcquire()).toEqual({ ok: true });
    now += 1000;
    expect(limiter.tryAcquire()).toEqual({ ok: true });
    expect(limiter.tryAcquire().ok).toBe(false);

    now += 60 * 60 * 1000 + 1;
    expect(limiter.tryAcquire()).toEqual({ ok: true });
  });

  it('reports usage counts', () => {
    let now = 0;
    const limiter = createAILimiter(20, () => now);
    limiter.tryAcquire();
    now += 1000;
    limiter.tryAcquire();

    expect(limiter.getUsage()).toMatchObject({ used: 2, max: 20 });
  });
});
