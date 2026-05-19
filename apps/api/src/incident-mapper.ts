import type { Incident } from '@httpbin-monitor/shared';

export type IncidentDetails = {
  rootCauses: string[];
  recommendations: string[];
};

export function parseIncidentDetails(rootCauses: unknown): IncidentDetails {
  if (typeof rootCauses === 'object' && rootCauses !== null) {
    const value = rootCauses as Record<string, unknown>;
    return {
      rootCauses: Array.isArray(value.rootCauses)
        ? value.rootCauses.map(String)
        : [],
      recommendations: Array.isArray(value.recommendations)
        ? value.recommendations.map(String)
        : [],
    };
  }

  if (Array.isArray(rootCauses)) {
    return { rootCauses: rootCauses.map(String), recommendations: [] };
  }

  return { rootCauses: [], recommendations: [] };
}

export function toIncident(row: {
  id: string;
  responseId: string;
  severity: string;
  summary: string;
  rootCauses: unknown;
  createdAt: Date;
}): Incident {
  return {
    id: row.id,
    responseId: row.responseId,
    severity: row.severity as Incident['severity'],
    summary: row.summary,
    rootCauses: row.rootCauses,
    createdAt: row.createdAt.toISOString(),
  };
}
