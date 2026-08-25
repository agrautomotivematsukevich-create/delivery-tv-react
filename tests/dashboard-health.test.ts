import { describe, expect, it } from 'vitest';
import {
  createDashboardHealth,
  markDashboardFailure,
  markDashboardSuccess,
} from '../utils/dashboardHealth';

describe('dashboard connection health', () => {
  it('treats one or two server failures as degraded, not offline', () => {
    let health = createDashboardHealth(true, 1_000);

    health = markDashboardFailure(health, true);
    expect(health.status).toBe('degraded');
    expect(health.consecutiveFailures).toBe(1);

    health = markDashboardFailure(health, true);
    expect(health.status).toBe('degraded');
    expect(health.consecutiveFailures).toBe(2);
  });

  it('marks offline after three consecutive server failures', () => {
    let health = createDashboardHealth(true, 1_000);

    health = markDashboardFailure(health, true);
    health = markDashboardFailure(health, true);
    health = markDashboardFailure(health, true);

    expect(health.status).toBe('offline');
  });

  it('marks a browser-level connection loss offline immediately', () => {
    const health = markDashboardFailure(createDashboardHealth(true, 1_000), false);

    expect(health.status).toBe('offline');
  });

  it('restores online state and last successful sync after success', () => {
    const failed = markDashboardFailure(
      markDashboardFailure(createDashboardHealth(true, 1_000), true),
      true,
    );

    const recovered = markDashboardSuccess(failed, 5_000);

    expect(recovered).toEqual({
      status: 'online', consecutiveFailures: 0, lastSuccessAt: 5_000,
    });
  });
});
