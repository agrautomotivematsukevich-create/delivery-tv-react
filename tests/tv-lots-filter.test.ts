import { describe, expect, it } from 'vitest';
import { filterTvLots, TV_MIN_LOT_CONTAINERS } from '../utils/tvLots';

// Owner, 16.09.2026: lots with 0–1 (and generally ≤5) containers only clutter the TV lots
// screen; show lots with more than five containers, counted over the whole 7-day window.
const lot = (lot: string, total: number, status: 'done' | 'in_progress' | 'waiting' = 'waiting') => ({ lot, total, status });

describe('TV lots filter', () => {
  it('shows only lots with more than five containers', () => {
    const kept = filterTvLots([
      lot('43115-AQT13J20260708', 1),
      lot('43115-CT13J20260509', 3, 'done'),
      lot('43115-CT13J20260410', 5),
      lot('43115-CM32T20260514', 6),
      lot('43115-CT1EJ20260503', 62, 'in_progress'),
    ]);

    expect(kept.map(l => l.lot)).toEqual(['43115-CM32T20260514', '43115-CT1EJ20260503']);
    expect(TV_MIN_LOT_CONTAINERS).toBe(6);
  });

  it('applies to closed lots too', () => {
    expect(filterTvLots([lot('43115-CT13J20260509', 3, 'done'), lot('43115-CT1EJ20260504', 65, 'done')]))
      .toHaveLength(1);
  });
});
