import type { ChatMessage, Incident, ResponseRecord } from '@httpbin-monitor/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export type ResponsesPage = {
  items: ResponseRecord[];
  nextCursor: string | null;
};

export type IncidentsPage = {
  items: Incident[];
  nextCursor: string | null;
};

export type DashboardStats = {
  total: number;
  avgResponseTime: number;
  errorRate: number;
};

export type AiUsage = {
  used: number;
  max: number;
  resetAt: string | null;
  estimatedCostUsd: number;
  configured: boolean;
};

export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'cached' }
  | { type: 'error'; text: string }
  | { type: 'done'; usage?: { inputTokens: number; outputTokens: number } };

export async function fetchResponses(opts: {
  limit?: number;
  cursor?: string;
}): Promise<ResponsesPage> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);

  const query = params.toString();
  const url = `${API_URL}/responses${query ? `?${query}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch responses: HTTP ${res.status}`);
  }

  return res.json() as Promise<ResponsesPage>;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/stats`);

  if (!res.ok) {
    throw new Error(`Failed to fetch stats: HTTP ${res.status}`);
  }

  return res.json() as Promise<DashboardStats>;
}

export async function fetchResponse(id: string): Promise<ResponseRecord> {
  const res = await fetch(`${API_URL}/responses/${id}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Response not found');
    }
    throw new Error(`Failed to fetch response: HTTP ${res.status}`);
  }

  return res.json() as Promise<ResponseRecord>;
}

export async function fetchIncidents(opts: {
  limit?: number;
  cursor?: string;
}): Promise<IncidentsPage> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);

  const query = params.toString();
  const url = `${API_URL}/incidents${query ? `?${query}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch incidents: HTTP ${res.status}`);
  }

  return res.json() as Promise<IncidentsPage>;
}

export async function fetchAiUsage(): Promise<AiUsage> {
  const res = await fetch(`${API_URL}/ai/usage`);
  if (!res.ok) {
    throw new Error(`Failed to fetch AI usage: HTTP ${res.status}`);
  }
  return res.json() as Promise<AiUsage>;
}

export async function fetchHealth(): Promise<boolean> {
  const res = await fetch(`${API_URL}/health`);
  return res.ok;
}

function parseSseChunk(chunk: string): { event: string; payload: unknown } | null {
  const lines = chunk.split('\n');
  let event = 'message';
  let dataLine = '';

  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLine = line.slice(5).trim();
  }

  if (!dataLine) return null;

  try {
    return { event, payload: JSON.parse(dataLine) as unknown };
  } catch {
    return null;
  }
}

export async function* streamChat(
  messages: ChatMessage[],
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('AI features not configured');
    }
    throw new Error(`Chat failed: HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Chat stream is not available');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const parsed = parseSseChunk(part);
      if (!parsed) continue;

      const payload = parsed.payload as Record<string, unknown>;

      if (parsed.event === 'token') {
        yield { type: 'token', text: String(payload.text ?? '') };
      } else if (parsed.event === 'cached') {
        yield { type: 'cached' };
      } else if (parsed.event === 'error') {
        yield { type: 'error', text: String(payload.message ?? 'Unknown error') };
      } else if (parsed.event === 'done') {
        yield {
          type: 'done',
          usage: payload.usage as { inputTokens: number; outputTokens: number } | undefined,
        };
      }
    }
  }
}
