import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { createAIClient, type AIClient } from './client.js';
import { createAICache, type AICache } from './cache.js';
import { createAILimiter, type AILimiter } from './limiter.js';
import { startIncidentMonitor } from './incidents.js';

export type AIServices = {
  ai: AIClient;
  cache: AICache;
  limiter: AILimiter;
  enabled: true;
};

export function createAIServices(config: {
  apiKey?: string;
  model: string;
  rateLimitPerHour: number;
  cacheTtlSeconds: number;
}): AIServices | null {
  if (!config.apiKey) return null;

  return {
    enabled: true,
    ai: createAIClient(config.apiKey, config.model),
    cache: createAICache(config.cacheTtlSeconds),
    limiter: createAILimiter(config.rateLimitPerHour),
  };
}

export function startAIMonitors(
  services: AIServices,
  deps: {
    prisma: PrismaClient;
    io: Server;
    logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  },
): { stop: () => void } {
  const incidentMonitor = startIncidentMonitor({
    prisma: deps.prisma,
    ai: services.ai,
    limiter: services.limiter,
    broadcaster: deps.io,
    logger: deps.logger,
  });

  return {
    stop: () => incidentMonitor.stop(),
  };
}

// Haiku pricing (USD per 1M tokens) — update if Anthropic changes rates.
export const HAIKU_INPUT_USD_PER_M = 1;
export const HAIKU_OUTPUT_USD_PER_M = 5;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M
  );
}
