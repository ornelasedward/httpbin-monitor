import { afterEach, describe, expect, it, vi } from 'vitest';
import { startScheduler } from './scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('startScheduler', () => {
  it('uses setInterval for sub-minute intervals', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn(), error: vi.fn() };
    const handle = startScheduler({ run }, 10, logger);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);

    handle.stop();
  });
});
