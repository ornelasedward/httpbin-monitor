import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';

export interface AICache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  hash(input: string): string;
}

export function createAICache(ttlSeconds = 3600): AICache {
  const store = new LRUCache<string, string>({
    max: 100,
    ttl: ttlSeconds * 1000,
  });

  return {
    get(key: string) {
      return store.get(key);
    },
    set(key: string, value: string) {
      store.set(key, value);
    },
    hash(input: string) {
      const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
      return createHash('sha256').update(normalized).digest('hex');
    },
  };
}
