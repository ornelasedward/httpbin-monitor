import { faker } from '@faker-js/faker';
import { MONITORED_ENDPOINT, PING_NEW, type ResponseRecord } from '@httpbin-monitor/shared';
const HTTP_TIMEOUT_MS = 10_000;

export interface PingWorkerDeps {
  httpClient: {
    post: (
      url: string,
      body: unknown,
      opts: { timeout: number },
    ) => Promise<{ status: number; data: unknown }>;
  };
  db: {
    response: {
      create: (args: { data: Omit<ResponseRecord, 'id'> }) => Promise<ResponseRecord>;
    };
  };
  broadcaster: { emit: (event: string, payload: ResponseRecord) => void };
  payloadGenerator: () => Record<string, unknown>;
  now: () => number;
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

function isTimeoutError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; name?: string };
  return e.code === 'ECONNABORTED' || e.name === 'TimeoutError';
}

function errorMessageFromUnknown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function defaultPayloadGenerator(): Record<string, unknown> {
  const includeMetadata = faker.datatype.boolean();

  return {
    id: faker.string.uuid(),
    timestamp: new Date().toISOString(),
    user: {
      name: faker.person.fullName(),
      email: faker.internet.email(),
    },
    event: {
      type: faker.helpers.arrayElement(['click', 'view', 'purchase', 'signup']),
      ...(includeMetadata
        ? {
            metadata: {
              source: faker.internet.domainName(),
              campaign: faker.commerce.productName(),
            },
          }
        : {}),
    },
  };
}

export function createPingWorker(deps: PingWorkerDeps) {
  const persistAndBroadcast = async (
    data: Omit<ResponseRecord, 'id'>,
  ): Promise<ResponseRecord | null> => {
    let record: ResponseRecord;

    try {
      record = await deps.db.response.create({ data });
    } catch (err) {
      deps.logger.error('ping worker: failed to persist response', err);
      return null;
    }

    try {
      deps.broadcaster.emit(PING_NEW, record);
    } catch (err) {
      deps.logger.error('ping worker: failed to broadcast response', err);
    }

    return record;
  };

  return {
    run: async (): Promise<ResponseRecord | null> => {
      const startedAt = deps.now();
      let requestPayload: Record<string, unknown>;

      try {
        requestPayload = deps.payloadGenerator();
      } catch (err) {
        deps.logger.error('ping worker: payload generation failed', err);
        return persistAndBroadcast({
          timestamp: new Date(startedAt).toISOString(),
          statusCode: 0,
          responseTimeMs: deps.now() - startedAt,
          requestPayload: {},
          responseBody: null,
          errorMessage: errorMessageFromUnknown(err),
        });
      }

      try {
        const response = await deps.httpClient.post(MONITORED_ENDPOINT, requestPayload, {
          timeout: HTTP_TIMEOUT_MS,
        });
        const responseTimeMs = deps.now() - startedAt;
        const isSuccess = response.status >= 200 && response.status < 300;

        return persistAndBroadcast({
          timestamp: new Date(startedAt).toISOString(),
          statusCode: response.status,
          responseTimeMs,
          requestPayload,
          responseBody: response.data,
          errorMessage: isSuccess ? null : `HTTP ${response.status}`,
        });
      } catch (err) {
        const responseTimeMs = deps.now() - startedAt;
        const errorMessage = isTimeoutError(err) ? 'timeout' : errorMessageFromUnknown(err);

        return persistAndBroadcast({
          timestamp: new Date(startedAt).toISOString(),
          statusCode: 0,
          responseTimeMs,
          requestPayload,
          responseBody: null,
          errorMessage,
        });
      }
    },
  };
}
