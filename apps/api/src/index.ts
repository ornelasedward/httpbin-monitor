import { createServer } from 'node:http';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import pino from 'pino';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRoutes } from './routes.js';
import { errorHandler } from './error-handler.js';
import { createSocketServer } from './ws.js';
import { createPingWorker } from './ping-worker.js';
import { buildPingWorkerDeps } from './build-ping-worker-deps.js';
import { startScheduler } from './scheduler.js';
import { createAIServices, startAIMonitors } from './ai/services.js';
import { prisma } from './db.js';
import { resolveFrontendOrigins } from './frontend-origins.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const PORT = Number(process.env.PORT ?? 3001);
const frontendOrigins = resolveFrontendOrigins();
const PING_INTERVAL_SECONDS = Number(process.env.PING_INTERVAL_SECONDS ?? 300);

const logger = pino({
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

const aiServices = createAIServices({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  rateLimitPerHour: Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? 20),
  cacheTtlSeconds: Number(process.env.AI_CACHE_TTL_SECONDS ?? 3600),
});

if (!process.env.ANTHROPIC_API_KEY) {
  logger.warn('ANTHROPIC_API_KEY is missing — AI chat and incident generation are disabled');
} else {
  logger.info('AI features enabled');
}

const app = express();
app.use(cors({ origin: frontendOrigins }));
app.use(express.json());
app.use(createRoutes({ ai: aiServices }));
app.use(errorHandler);

const httpServer = createServer(app);
const io = createSocketServer(httpServer, frontendOrigins);

let schedulerHandle: { stop: () => void } | undefined;
let aiMonitorHandle: { stop: () => void } | undefined;

if (process.env.NODE_ENV !== 'test') {
  const worker = createPingWorker(buildPingWorkerDeps(io, logger));
  schedulerHandle = startScheduler(worker, PING_INTERVAL_SECONDS, logger);
  logger.info(`scheduler started, interval=${PING_INTERVAL_SECONDS}s`);

  if (aiServices) {
    aiMonitorHandle = startAIMonitors(aiServices, { prisma, io, logger });
    logger.info('incident monitor started');
  }
}

const shutdown = () => {
  schedulerHandle?.stop();
  aiMonitorHandle?.stop();
  io.close();
  httpServer.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

httpServer.listen(PORT, () => {
  logger.info(`API listening on http://localhost:${PORT}`);
});

export { app, httpServer, io };
