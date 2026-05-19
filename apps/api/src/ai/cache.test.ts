import { describe, expect, it } from 'vitest';
import { createAICache } from './cache.js';

describe('createAICache', () => {
  it('returns undefined for missing keys', () => {
    const cache = createAICache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns stored values', () => {
    const cache = createAICache();
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('hashes deterministically', () => {
    const cache = createAICache();
    expect(cache.hash('Hello   World')).toBe(cache.hash('hello world'));
    expect(cache.hash('a')).not.toBe(cache.hash('b'));
  });

  it('uses different keys for different data fingerprints', () => {
    const cache = createAICache();
    const question = 'any errors recently?';
    const keyA = cache.hash(`${question}|0`);
    const keyB = cache.hash(`${question}|10`);
    expect(keyA).not.toBe(keyB);
  });
});
