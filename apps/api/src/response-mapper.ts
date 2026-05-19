import type { ResponseRecord } from '@httpbin-monitor/shared';

type PrismaResponseRow = {
  id: string;
  timestamp: Date;
  statusCode: number;
  responseTimeMs: number;
  requestPayload: unknown;
  responseBody: unknown;
  errorMessage: string | null;
};

export function toResponseRecord(row: PrismaResponseRow): ResponseRecord {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    statusCode: row.statusCode,
    responseTimeMs: row.responseTimeMs,
    requestPayload: row.requestPayload,
    responseBody: row.responseBody,
    errorMessage: row.errorMessage,
  };
}
