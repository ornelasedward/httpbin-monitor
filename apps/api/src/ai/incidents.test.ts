import { describe, expect, it } from 'vitest';
import { anomalyThresholdMs, computeRollingAverageMs, isAnomalousLatency } from './incidents.js';

describe('incident anomaly detection', () => {
  it('returns null rolling average for empty input', () => {
    expect(computeRollingAverageMs([])).toBeNull();
  });

  it('computes rolling average over success latencies', () => {
    expect(computeRollingAverageMs([100, 200, 300])).toBe(200);
  });

  it('rounds anomaly threshold at 2x rolling average', () => {
    expect(anomalyThresholdMs(150)).toBe(300);
    expect(anomalyThresholdMs(151)).toBe(302);
  });

  it('flags responses above 2x rolling average', () => {
    expect(isAnomalousLatency(301, 150)).toBe(true);
    expect(isAnomalousLatency(300, 150)).toBe(false);
    expect(isAnomalousLatency(299, 150)).toBe(false);
  });

  it('supports custom multiplier', () => {
    expect(isAnomalousLatency(250, 100, 3)).toBe(false);
    expect(isAnomalousLatency(301, 100, 3)).toBe(true);
  });
});
