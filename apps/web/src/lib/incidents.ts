import type { Incident } from '@httpbin-monitor/shared';

export function findIncidentForResponse(
  incidents: Incident[],
  responseId: string,
): Incident | undefined {
  return incidents.find((incident) => incident.responseId === responseId);
}

export function parseIncidentDetails(rootCauses: unknown): {
  rootCauses: string[];
  recommendations: string[];
} {
  if (Array.isArray(rootCauses)) {
    return { rootCauses: rootCauses.map(String), recommendations: [] };
  }

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

  return { rootCauses: [], recommendations: [] };
}
