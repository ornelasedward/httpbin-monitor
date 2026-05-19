import { describe, expect, it, vi } from 'vitest';
import { acquireErrorMessage, acquireLlmCall } from './acquire-llm.js';
import { createAILimiter } from './limiter.js';

describe('acquireLlmCall', () => {
  it('blocks when input tokens exceed budget', async () => {
    const result = await acquireLlmCall({
      ai: {
        countInputTokens: vi.fn().mockResolvedValue(9000),
      } as never,
      limiter: createAILimiter(20),
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxInputTokens: 8000,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'token_budget',
      inputTokens: 9000,
      maxInputTokens: 8000,
    });
  });

  it('blocks when hourly rate limit is exhausted', async () => {
    const limiter = createAILimiter(1);
    limiter.tryAcquire();

    const result = await acquireLlmCall({
      ai: {
        countInputTokens: vi.fn().mockResolvedValue(100),
      } as never,
      limiter,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('rate_limit');
    }
  });

  it('acquires when under token budget and within rate limit', async () => {
    const result = await acquireLlmCall({
      ai: {
        countInputTokens: vi.fn().mockResolvedValue(250),
      } as never,
      limiter: createAILimiter(20),
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toEqual({ ok: true, inputTokens: 250 });
  });
});

describe('acquireErrorMessage', () => {
  it('formats rate limit errors', () => {
    const resetAt = new Date('2026-05-19T22:00:00.000Z');
    const message = acquireErrorMessage({ ok: false, reason: 'rate_limit', resetAt });
    expect(message).toContain('20 LLM calls/hour');
    expect(message).toContain(resetAt.toLocaleTimeString());
  });
});
