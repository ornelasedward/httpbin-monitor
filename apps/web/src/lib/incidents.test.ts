import { describe, expect, it } from 'vitest';
import type { Incident } from '@httpbin-monitor/shared';
import { findIncidentForResponse, parseIncidentDetails } from './incidents';

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-1',
    responseId: 'rec-1',
    severity: 'medium',
    summary: 'Slow response',
    rootCauses: { rootCauses: ['latency'], recommendations: ['scale up'] },
    createdAt: '2026-05-19T12:00:00.000Z',
    ...overrides,
  };
}

describe('parseIncidentDetails', () => {
  it('parses structured rootCauses object', () => {
    expect(
      parseIncidentDetails({
        rootCauses: ['Network jitter'],
        recommendations: ['Add retries'],
      }),
    ).toEqual({
      rootCauses: ['Network jitter'],
      recommendations: ['Add retries'],
    });
  });

  it('parses legacy array-only rootCauses', () => {
    expect(parseIncidentDetails(['legacy cause'])).toEqual({
      rootCauses: ['legacy cause'],
      recommendations: [],
    });
  });

  it('returns empty lists for unknown shapes', () => {
    expect(parseIncidentDetails(null)).toEqual({
      rootCauses: [],
      recommendations: [],
    });
  });
});

describe('findIncidentForResponse', () => {
  it('returns the incident linked to a response id', () => {
    const incidents = [
      makeIncident({ id: 'a', responseId: 'rec-1' }),
      makeIncident({ id: 'b', responseId: 'rec-2' }),
    ];

    expect(findIncidentForResponse(incidents, 'rec-2')?.id).toBe('b');
  });

  it('returns undefined when no incident matches', () => {
    expect(findIncidentForResponse([makeIncident()], 'missing')).toBeUndefined();
  });
});
