import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@httpbin-monitor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAiUsage } from '@/hooks/useAiUsage';
import { streamChat } from '@/lib/api';
import { cn } from '@/lib/utils';

const SUGGESTED_PROMPTS = [
  "What's the average response time in the last hour?",
  'Any errors today?',
  'Show me the 5 slowest responses',
];

function createMessage(role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const usage = useAiUsage(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMessage = createMessage('user', trimmed);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);

    const assistantMessage = createMessage('assistant', '');
    setMessages((current) => [...current, assistantMessage]);

    try {
      for await (const event of streamChat(nextMessages)) {
        if (event.type === 'token') {
          setMessages((current) => {
            const updated = [...current];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.text,
              };
            }
            return updated;
          });
        }

        if (event.type === 'error') {
          setMessages((current) => {
            const updated = [...current];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: event.text,
              };
            }
            return updated;
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat failed';
      setMessages((current) => {
        const updated = [...current];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: message };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 z-40 h-12 rounded-full px-5 shadow-warm-lg"
          type="button"
        >
          Ask AI
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">Monitoring assistant</SheetTitle>
          <SheetDescription>
            Ask questions about pings, latency, and errors in plain language.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              size="sm"
              variant="outline"
              disabled={streaming}
              onClick={() => void sendMessage(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ask about response times, errors, or recent pings. The assistant queries your database
              before answering.
            </p>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                message.role === 'user'
                  ? 'ml-8 bg-primary text-primary-foreground'
                  : 'mr-8 bg-muted text-foreground',
              )}
            >
              {message.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || '…'}</ReactMarkdown>
              ) : (
                message.content
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          className="mt-4 flex gap-2 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your monitoring data…"
            aria-label="Chat message"
            disabled={streaming}
          />
          <Button type="submit" disabled={streaming || !input.trim()}>
            Send
          </Button>
        </form>

        <p className="mt-2 text-xs text-muted-foreground">
          {usage?.configured
            ? `AI usage: ${usage.used}/${usage.max} this hour · est. $${usage.estimatedCostUsd.toFixed(4)}`
            : 'AI usage unavailable'}
          {usage?.resetAt ? ` · resets ${new Date(usage.resetAt).toLocaleTimeString()}` : null}
        </p>
      </SheetContent>
    </Sheet>
  );
}
