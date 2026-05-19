import type Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';
import type { ChatMessage } from '@httpbin-monitor/shared';
import type { AIClient } from './client.js';
import type { AICache } from './cache.js';
import type { AILimiter } from './limiter.js';
import { acquireErrorMessage, acquireLlmCall } from './acquire-llm.js';
import { loadPrompt } from './prompts.js';
import { executeQueryResponses, queryResponsesTool } from './tools.js';
import { getRecentDataFingerprint } from './data-fingerprint.js';

const MAX_TOOL_CALLS = 3;

type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'cached'; text: string }
  | { type: 'error'; text: string }
  | { type: 'done'; usage?: { inputTokens: number; outputTokens: number } };

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function latestUserMessage(messages: Anthropic.MessageParam[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user' && typeof message.content === 'string') {
      return message.content;
    }
  }
  return '';
}

export async function* handleChatStream(
  deps: {
    ai: AIClient;
    cache: AICache;
    limiter: AILimiter;
    prisma: PrismaClient;
  },
  messages: ChatMessage[],
): AsyncIterable<ChatStreamEvent> {
  let activeMessages = toAnthropicMessages(messages);
  const userQuestion = latestUserMessage(activeMessages);

  if (!userQuestion.trim()) {
    yield { type: 'error', text: 'Please enter a question.' };
    return;
  }

  const fingerprint = await getRecentDataFingerprint(deps.prisma);
  const cacheKey = deps.cache.hash(`${userQuestion}|${fingerprint}`);
  const cached = deps.cache.get(cacheKey);
  if (cached) {
    yield { type: 'cached', text: '' };
    yield { type: 'token', text: cached };
    yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
    return;
  }

  const system = loadPrompt('chat-system');
  let toolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let assembled = '';

  while (toolCalls <= MAX_TOOL_CALLS) {
    const acquired = await acquireLlmCall({
      ai: deps.ai,
      limiter: deps.limiter,
      system,
      messages: activeMessages,
      tools: [queryResponsesTool],
    });
    if (!acquired.ok) {
      yield { type: 'error', text: acquireErrorMessage(acquired) };
      return;
    }

    let pendingTool: { id: string; name: string; input: unknown } | undefined;

    for await (const event of deps.ai.stream({
      system,
      messages: activeMessages,
      tools: [queryResponsesTool],
      maxTokens: 1024,
    })) {
      if (event.type === 'text' && event.text) {
        assembled += event.text;
        yield { type: 'token', text: event.text };
      }

      if (event.type === 'tool_use' && event.toolUse) {
        pendingTool = event.toolUse;
      }

      if (event.type === 'done' && event.usage) {
        inputTokens += event.usage.inputTokens;
        outputTokens += event.usage.outputTokens;
      }
    }

    if (!pendingTool) {
      break;
    }

    if (toolCalls >= MAX_TOOL_CALLS) {
      yield {
        type: 'error',
        text: 'Too many tool calls for one question. Please narrow your request.',
      };
      return;
    }

    toolCalls += 1;

    let toolResult: Record<string, unknown>;
    try {
      toolResult = await executeQueryResponses(pendingTool.input, deps.prisma);
    } catch (err) {
      toolResult = {
        error: err instanceof Error ? err.message : 'Tool execution failed',
      };
    }

    activeMessages = [
      ...activeMessages,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: pendingTool.id,
            name: pendingTool.name,
            input: pendingTool.input as Record<string, unknown>,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: pendingTool.id,
            content: JSON.stringify(toolResult),
          },
        ],
      },
    ];
  }

  deps.cache.set(cacheKey, assembled);
  yield { type: 'done', usage: { inputTokens, outputTokens } };
}
