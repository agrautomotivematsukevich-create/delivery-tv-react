// Owner rule (16.09.2026): lots with a handful of containers only clutter the TV lots
// screen — show a lot only when it has more than five containers over the whole
// tv_lot_progress window (tomorrow + today + previous days), closed lots included.
export const TV_MIN_LOT_CONTAINERS = 6;

export const filterTvLots = <T extends { total: number }>(lots: T[]): T[] =>
  lots.filter((lot) => lot.total >= TV_MIN_LOT_CONTAINERS);
