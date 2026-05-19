export interface AILimiter {
  tryAcquire(): { ok: true } | { ok: false; resetAt: Date };
  getUsage(): { used: number; max: number; resetAt: Date };
}

export function createAILimiter(maxPerHour = 20, now: () => number = Date.now): AILimiter {
  const windowMs = 60 * 60 * 1000;
  const timestamps: number[] = [];

  const prune = () => {
    const cutoff = now() - windowMs;
    while (timestamps.length > 0 && timestamps[0]! < cutoff) {
      timestamps.shift();
    }
  };

  const resetAt = (): Date => {
    prune();
    if (timestamps.length === 0) {
      return new Date(now() + windowMs);
    }
    return new Date(timestamps[0]! + windowMs);
  };

  return {
    tryAcquire() {
      prune();
      if (timestamps.length >= maxPerHour) {
        return { ok: false, resetAt: resetAt() };
      }
      timestamps.push(now());
      return { ok: true };
    },
    getUsage() {
      prune();
      return {
        used: timestamps.length,
        max: maxPerHour,
        resetAt: resetAt(),
      };
    },
  };
}
