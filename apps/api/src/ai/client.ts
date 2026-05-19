import Anthropic from '@anthropic-ai/sdk';

export interface AIClient {
  countInputTokens(opts: {
    messages: Anthropic.MessageParam[];
    system: string;
    tools?: Anthropic.Tool[];
  }): Promise<number>;
  stream(opts: {
    messages: Anthropic.MessageParam[];
    system: string;
    tools?: Anthropic.Tool[];
    maxTokens?: number;
  }): AsyncIterable<{
    type: 'text' | 'tool_use' | 'done';
    text?: string;
    toolUse?: { id: string; name: string; input: unknown };
    usage?: { inputTokens: number; outputTokens: number };
  }>;
  complete(opts: {
    system: string;
    messages: Anthropic.MessageParam[];
    maxTokens?: number;
  }): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }>;
  completeWithForcedTool(opts: {
    system: string;
    messages: Anthropic.MessageParam[];
    tool: Anthropic.Tool;
    maxTokens?: number;
  }): Promise<{ input: unknown; usage: { inputTokens: number; outputTokens: number } }>;
}

export function createAIClient(apiKey: string, model: string): AIClient {
  const client = new Anthropic({ apiKey });

  return {
    async countInputTokens(opts) {
      const result = await client.messages.countTokens({
        model,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
      });
      return result.input_tokens;
    },
    async complete(opts) {
      const response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system,
        messages: opts.messages,
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
    async completeWithForcedTool(opts) {
      const response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 512,
        system: opts.system,
        messages: opts.messages,
        tools: [opts.tool],
        tool_choice: { type: 'tool', name: opts.tool.name },
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (!toolUse) {
        throw new Error('Missing tool_use block in incident response');
      }

      return {
        input: toolUse.input,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
    async *stream(opts) {
      const response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        stream: true,
      });

      let inputTokens = 0;
      let outputTokens = 0;
      const toolBlocks = new Map<number, { id: string; name: string; inputJson: string }>();

      for await (const event of response) {
        if (event.type === 'message_start' && event.message.usage) {
          inputTokens = event.message.usage.input_tokens ?? inputTokens;
        }

        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          toolBlocks.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          });
        }

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          }
          if (event.delta.type === 'input_json_delta') {
            const block = toolBlocks.get(event.index);
            if (block) block.inputJson += event.delta.partial_json;
          }
        }

        if (event.type === 'content_block_stop') {
          const block = toolBlocks.get(event.index);
          if (block) {
            let input: unknown = {};
            try {
              input = JSON.parse(block.inputJson || '{}');
            } catch {
              input = {};
            }
            yield {
              type: 'tool_use',
              toolUse: { id: block.id, name: block.name, input },
            };
          }
        }

        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens ?? outputTokens;
        }

        if (event.type === 'message_stop') {
          yield {
            type: 'done',
            usage: { inputTokens, outputTokens },
          };
        }
      }
    },
  };
}
