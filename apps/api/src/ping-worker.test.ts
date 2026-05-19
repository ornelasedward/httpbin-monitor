import { describe, expect, it, vi } from 'vitest';
import { PING_NEW, type ResponseRecord } from '@httpbin-monitor/shared';
import { createPingWorker, type PingWorkerDeps } from './ping-worker.js';

function makeRecord(overrides: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    id: 'rec_1',
    timestamp: '2026-05-19T12:00:00.000Z',
    statusCode: 200,
    responseTimeMs: 100,
    requestPayload: { id: 'payload-1' },
    responseBody: { ok: true },
    errorMessage: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PingWorkerDeps> = {}): PingWorkerDeps {
  const persisted = makeRecord();

  return {
    httpClient: {
      post: vi.fn().mockResolvedValue({ status: 200, data: { ok: true } }),
    },
    db: {
      response: {
        create: vi.fn().mockResolvedValue(persisted),
      },
    },
    broadcaster: {
      emit: vi.fn(),
    },
    payloadGenerator: vi.fn().mockReturnValue({ id: 'payload-1' }),
    now: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1234),
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

describe('createPingWorker', () => {
  it('happy path: persists 200 response and broadcasts PING_NEW', async () => {
    const deps = makeDeps();
    const worker = createPingWorker(deps);

    const result = await worker.run();

    expect(result).toEqual(makeRecord());
    expect(deps.db.response.create).toHaveBeenCalledOnce();
    expect(deps.db.response.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statusCode: 200,
        errorMessage: null,
        responseBody: { ok: true },
        responseTimeMs: 234,
      }),
    });
    expect(deps.broadcaster.emit).toHaveBeenCalledOnce();
    expect(deps.broadcaster.emit).toHaveBeenCalledWith(PING_NEW, makeRecord());
  });

  it('4xx response: persists with HTTP error message and still broadcasts', async () => {
    const deps = makeDeps({
      httpClient: {
        post: vi.fn().mockResolvedValue({ status: 404, data: { error: 'not found' } }),
      },
      db: {
        response: {
          create: vi
            .fn()
            .mockResolvedValue(makeRecord({ statusCode: 404, errorMessage: 'HTTP 404' })),
        },
      },
    });
    const worker = createPingWorker(deps);

    const result = await worker.run();

    expect(result?.statusCode).toBe(404);
    expect(deps.db.response.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statusCode: 404,
        errorMessage: 'HTTP 404',
        responseBody: { error: 'not found' },
      }),
    });
    expect(deps.broadcaster.emit).toHaveBeenCalledOnce();
  });

  it('5xx response: persists with HTTP 503 error message', async () => {
    const deps = makeDeps({
      httpClient: {
        post: vi.fn().mockResolvedValue({ status: 503, data: { error: 'unavailable' } }),
      },
      db: {
        response: {
          create: vi
            .fn()
            .mockResolvedValue(makeRecord({ statusCode: 503, errorMessage: 'HTTP 503' })),
        },
      },
    });
    const worker = createPingWorker(deps);

    await worker.run();

    expect(deps.db.response.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statusCode: 503,
        errorMessage: 'HTTP 503',
      }),
    });
  });

  it('timeout: persists statusCode=0 with timeout error and null body', async () => {
    const deps = makeDeps({
      httpClient: {
        post: vi.fn().mockRejectedValue({ code: 'ECONNABORTED' }),
      },
      db: {
        response: {
          create: vi
            .fn()
            .mockResolvedValue(
              makeRecord({ statusCode: 0, errorMessage: 'timeout', responseBody: null }),
            ),
        },
      },
    });
    const worker = createPingWorker(deps);

    await worker.run();

    expect(deps.db.response.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statusCode: 0,
        errorMessage: 'timeout',
        responseBody: null,
      }),
    });
  });

  it('network error: persists statusCode=0 with ENOTFOUND message', async () => {
    const deps = makeDeps({
      httpClient: {
        post: vi.fn().mockRejectedValue(new Error('ENOTFOUND httpbin.org')),
      },
      db: {
        response: {
          create: vi.fn().mockResolvedValue(
            makeRecord({
              statusCode: 0,
              errorMessage: 'ENOTFOUND httpbin.org',
              responseBody: null,
            }),
          ),
        },
      },
    });
    const worker = createPingWorker(deps);

    await worker.run();

    expect(deps.db.response.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statusCode: 0,
        errorMessage: expect.stringMatching(/ENOTFOUND/),
        responseBody: null,
      }),
    });
  });

  it('db failure: returns null, logs error, does not broadcast', async () => {
    const deps = makeDeps({
      db: {
        response: {
          create: vi.fn().mockRejectedValue(new Error('db down')),
        },
      },
    });
    const worker = createPingWorker(deps);

    const result = await worker.run();

    expect(result).toBeNull();
    expect(deps.logger.error).toHaveBeenCalled();
    expect(deps.broadcaster.emit).not.toHaveBeenCalled();
  });

  it('broadcaster failure: still returns persisted record and logs error', async () => {
    const persisted = makeRecord({ id: 'rec_broadcast_fail' });
    const deps = makeDeps({
      db: {
        response: {
          create: vi.fn().mockResolvedValue(persisted),
        },
      },
      broadcaster: {
        emit: vi.fn().mockImplementation(() => {
          throw new Error('socket down');
        }),
      },
    });
    const worker = createPingWorker(deps);

    const result = await worker.run();

    expect(result).toEqual(persisted);
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('calls payloadGenerator exactly once per run', async () => {
    const deps = makeDeps();
    const worker = createPingWorker(deps);

    await worker.run();

    expect(deps.payloadGenerator).toHaveBeenCalledOnce();
  });

  it('computes responseTimeMs from deps.now()', async () => {
    const deps = makeDeps({
      now: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1500),
    });
    const worker = createPingWorker(deps);

    await worker.run();

    expect(deps.db.response.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ responseTimeMs: 500 }),
    });
  });

  it('multiple sequential runs create and broadcast twice with distinct payloads', async () => {
    const payloadGenerator = vi
      .fn()
      .mockReturnValueOnce({ id: 'payload-a' })
      .mockReturnValueOnce({ id: 'payload-b' });

    let clock = 1_000;
    const deps = makeDeps({
      payloadGenerator,
      now: vi.fn(() => {
        const current = clock;
        clock += 100;
        return current;
      }),
      db: {
        response: {
          create: vi
            .fn()
            .mockResolvedValueOnce(makeRecord({ id: 'rec_a', requestPayload: { id: 'payload-a' } }))
            .mockResolvedValueOnce(makeRecord({ id: 'rec_b', requestPayload: { id: 'payload-b' } })),
        },
      },
    });
    const worker = createPingWorker(deps);

    await worker.run();
    await worker.run();

    expect(deps.db.response.create).toHaveBeenCalledTimes(2);
    expect(deps.broadcaster.emit).toHaveBeenCalledTimes(2);
    const createMock = vi.mocked(deps.db.response.create);
    expect(createMock.mock.calls[0]?.[0].data.requestPayload).toEqual({
      id: 'payload-a',
    });
    expect(createMock.mock.calls[1]?.[0].data.requestPayload).toEqual({
      id: 'payload-b',
    });
  });
});
