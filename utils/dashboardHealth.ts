export type DashboardHealthStatus = 'online' | 'degraded' | 'offline';

export interface DashboardHealth {
  status: DashboardHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
}

const OFFLINE_FAILURE_THRESHOLD = 3;

export function createDashboardHealth(browserOnline: boolean, now: number = Date.now()): DashboardHealth {
  return {
    status: browserOnline ? 'online' : 'offline',
    consecutiveFailures: browserOnline ? 0 : OFFLINE_FAILURE_THRESHOLD,
    lastSuccessAt: browserOnline ? now : null,
  };
}

export function markDashboardFailure(
  previous: DashboardHealth,
  browserOnline: boolean,
): DashboardHealth {
  const consecutiveFailures = browserOnline
    ? previous.consecutiveFailures + 1
    : OFFLINE_FAILURE_THRESHOLD;

  return {
    status: !browserOnline || consecutiveFailures >= OFFLINE_FAILURE_THRESHOLD
      ? 'offline'
      : 'degraded',
    consecutiveFailures,
    lastSuccessAt: previous.lastSuccessAt,
  };
}

export function markDashboardSuccess(
  _previous: DashboardHealth,
  now: number = Date.now(),
): DashboardHealth {
  return { status: 'online', consecutiveFailures: 0, lastSuccessAt: now };
}
