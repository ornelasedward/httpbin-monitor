import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@httpbin-monitor/shared';
import {
  fetchAiUsage,
  fetchDashboardStats,
  fetchHealth,
  fetchIncidents,
  fetchResponse,
  fetchResponses,
  streamChat,
} from './api.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function sseResponse(chunks: string[]) {
  let index = 0;
  const encoder = new TextEncoder();

  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read(): Promise<{ done: boolean; value?: Uint8Array }> {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            const value = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
}

describe('fetchHealth', () => {
  it('returns true when /health is ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(fetchHealth()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health'));
  });

  it('returns false when /health fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(fetchHealth()).resolves.toBe(false);
  });
});

describe('fetchResponses', () => {
  it('requests with limit and cursor query params', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextCursor: null }),
    );

    await fetchResponses({ limit: 25, cursor: 'abc123' });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/responses?');
    expect(url).toContain('limit=25');
    expect(url).toContain('cursor=abc123');
  });

  it('throws when the API returns an error status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(fetchResponses({})).rejects.toThrow(/Failed to fetch responses/);
  });
});

describe('fetchDashboardStats', () => {
  it('returns stats from /stats', async () => {
    const stats = { total: 151, avgResponseTime: 248, errorRate: 1.3 };
    fetchMock.mockResolvedValueOnce(jsonResponse(stats));

    await expect(fetchDashboardStats()).resolves.toEqual(stats);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/stats');
  });
});

describe('fetchResponse', () => {
  it('returns a single response by id', async () => {
    const record = {
      id: 'resp_1',
      timestamp: '2026-05-19T12:00:00.000Z',
      statusCode: 200,
      responseTimeMs: 250,
      requestPayload: { ping: true },
      responseBody: { ok: true },
      errorMessage: null,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(record));

    await expect(fetchResponse('resp_1')).resolves.toEqual(record);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/responses/resp_1');
  });

  it('throws when the response is not found', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));

    await expect(fetchResponse('missing')).rejects.toThrow(/Response not found/);
  });
});

describe('fetchIncidents', () => {
  it('returns parsed incident page', async () => {
    const page = {
      items: [
        {
          id: 'inc_1',
          responseId: 'resp_1',
          severity: 'medium' as const,
          summary: 'Slow response',
          rootCauses: { rootCauses: [], recommendations: [] },
          createdAt: '2026-05-19T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(page));

    await expect(fetchIncidents({ limit: 10 })).resolves.toEqual(page);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/incidents');
  });
});

describe('fetchAiUsage', () => {
  it('returns usage payload from /ai/usage', async () => {
    const usage = {
      used: 2,
      max: 20,
      resetAt: '2026-05-19T22:00:00.000Z',
      estimatedCostUsd: 0.004,
      configured: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(usage));

    await expect(fetchAiUsage()).resolves.toEqual(usage);
  });

  it('throws on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));

    await expect(fetchAiUsage()).rejects.toThrow(/Failed to fetch AI usage/);
  });
});

describe('streamChat', () => {
  const messages: ChatMessage[] = [
    {
      id: '1',
      role: 'user',
      content: 'How many errors today?',
      createdAt: '2026-05-19T12:00:00.000Z',
    },
  ];

  it('parses token and done SSE events', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'event: token\ndata: {"text":"There "}\n\n',
        'event: token\ndata: {"text":"were 0."}\n\n',
        'event: done\ndata: {"usage":{"inputTokens":100,"outputTokens":20}}\n\n',
      ]),
    );

    const events = [];
    for await (const event of streamChat(messages)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'token', text: 'There ' },
      { type: 'token', text: 'were 0.' },
      { type: 'done', usage: { inputTokens: 100, outputTokens: 20 } },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/ai/chat'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when AI is not configured (503)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(async () => {
      for await (const _ of streamChat(messages)) {
        // drain
      }
    }).rejects.toThrow('AI features not configured');
  });

  it('yields cached event from SSE', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(['event: cached\ndata: {}\n\n', 'event: done\ndata: {}\n\n']),
    );

    const events = [];
    for await (const event of streamChat(messages)) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'cached' }, { type: 'done', usage: undefined }]);
  });
});
