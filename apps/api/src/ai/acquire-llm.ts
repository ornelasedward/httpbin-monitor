import type Anthropic from '@anthropic-ai/sdk';
import type { AIClient } from './client.js';
import type { AILimiter } from './limiter.js';

export type AcquireLlmResult =
  | { ok: true; inputTokens: number }
  | { ok: false; reason: 'rate_limit'; resetAt: Date }
  | { ok: false; reason: 'token_budget'; inputTokens: number; maxInputTokens: number };

export function defaultMaxInputTokens(): number {
  return Number(process.env.AI_MAX_INPUT_TOKENS ?? 8000);
}

/**
 * Counts input tokens via Anthropic, enforces a pre-call budget, then consumes one hourly slot.
 */
export async function acquireLlmCall(deps: {
  ai: AIClient;
  limiter: AILimiter;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  maxInputTokens?: number;
}): Promise<AcquireLlmResult> {
  const maxInputTokens = deps.maxInputTokens ?? defaultMaxInputTokens();

  let inputTokens = 0;
  try {
    inputTokens = await deps.ai.countInputTokens({
      system: deps.system,
      messages: deps.messages,
      tools: deps.tools,
    });
  } catch {
    // If count_tokens fails (network, etc.), proceed with limiter only.
    inputTokens = 0;
  }

  if (inputTokens > maxInputTokens) {
    return { ok: false, reason: 'token_budget', inputTokens, maxInputTokens };
  }

  const limit = deps.limiter.tryAcquire();
  if (!limit.ok) {
    return { ok: false, reason: 'rate_limit', resetAt: limit.resetAt };
  }

  return { ok: true, inputTokens };
}

export function acquireErrorMessage(result: Extract<AcquireLlmResult, { ok: false }>): string {
  if (result.reason === 'rate_limit') {
    return `Rate limit reached (20 LLM calls/hour). Try again after ${result.resetAt.toLocaleTimeString()}.`;
  }
  return `Request too large (${result.inputTokens} input tokens; max ${result.maxInputTokens}). Narrow your question or time window.`;
}
