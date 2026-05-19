export const PING_NEW = 'ping:new' as const;
export const INCIDENT_NEW = 'incident:new' as const;

export const MONITORED_ENDPOINT = 'https://httpbin.org/anything' as const;
export const MONITORED_ENDPOINT_LABEL = 'httpbin.org/anything' as const;

export type ResponseRecord = {
  id: string;
  timestamp: string;
  statusCode: number;
  responseTimeMs: number;
  requestPayload: unknown;
  responseBody: unknown;
  errorMessage: string | null;
};

export type Incident = {
  id: string;
  responseId: string;
  severity: 'low' | 'medium' | 'high';
  summary: string;
  rootCauses: unknown;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};
