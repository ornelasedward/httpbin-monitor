import { Prisma } from '@prisma/client';
import axios from 'axios';
import type { Server } from 'socket.io';
import type { PingWorkerDeps } from './ping-worker.js';
import { defaultPayloadGenerator } from './ping-worker.js';
import { prisma } from './db.js';
import { toResponseRecord } from './response-mapper.js';

export function buildPingWorkerDeps(io: Server, logger: PingWorkerDeps['logger']): PingWorkerDeps {
  return {
    httpClient: {
      post: async (url, body, opts) => {
        const response = await axios.post(url, body, {
          timeout: opts.timeout,
          validateStatus: () => true,
        });
        return { status: response.status, data: response.data };
      },
    },
    db: {
      response: {
        create: async ({ data }) => {
          const row = await prisma.response.create({
            data: {
              timestamp: new Date(data.timestamp),
              statusCode: data.statusCode,
              responseTimeMs: data.responseTimeMs,
              requestPayload: data.requestPayload as Prisma.InputJsonValue,
              responseBody:
                data.responseBody === null
                  ? Prisma.JsonNull
                  : (data.responseBody as Prisma.InputJsonValue),
              errorMessage: data.errorMessage,
            },
          });
          return toResponseRecord(row);
        },
      },
    },
    broadcaster: {
      emit: (event, payload) => {
        io.emit(event, payload);
      },
    },
    payloadGenerator: defaultPayloadGenerator,
    now: () => Date.now(),
    logger,
  };
}
