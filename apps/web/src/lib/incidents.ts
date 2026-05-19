export function parseIncidentDetails(rootCauses: unknown): {
  rootCauses: string[];
  recommendations: string[];
} {
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
