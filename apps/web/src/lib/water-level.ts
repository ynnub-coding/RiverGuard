/**
 * Rainfall-derived water-level proxy — the dataset's own derivation,
 * extended over live days.
 *
 * The bundled `data/daily_observations.csv` ends at its last row, but the
 * dashboard wants the proxy line through today. The column is derived from
 * rainfall, not observed, and `data/generate_dataset.py` documents the exact
 * recipe:
 *
 *     quick_t = 0.80*quick + Rain_t          # direct runoff, ~5-day memory
 *     slow_t  = 0.97*slow  + 0.06*Rain_t     # baseflow, ~3-week memory
 *     index_t = 0.012*quick_t + 0.030*slow_t
 *
 *     p98   = 98th percentile of the index over the whole series
 *     p_top = 99.9th percentile over the whole series
 *     index <= p98   -> dry-season floor (Alarm 1 − 2.0 m) .. Alarm 1
 *     index >  p98   -> Alarm 1 .. Alarm 3, saturating at Alarm 3
 *
 * This module re-applies that recipe verbatim to an ordered rainfall series
 * that runs 2016-01-01 → today, so live days after the dataset's last row get
 * the same derived value the dataset itself would have produced. Reproducing
 * the stored series from the CSV's own rainfall lands within 0.2 m of every
 * stored value in the four supported cities (median absolute error ≈ 0.03 m;
 * the residual is the ±0.05 m noise the generator added, which this module
 * deliberately does not simulate).
 *
 * Requirements and limits, all deliberate:
 *   - The caller must supply the FULL ordered history from the dataset's
 *     first date. The quick/slow stores are seeded at 0 at series start, so a
 *     suffix-only run produces different numbers.
 *   - `stageLevels` refits the percentiles over the extended series, exactly
 *     as the generator does over its own series. Adding live days can shift
 *     p98 slightly; that is how the dataset would have been generated were it
 *     regenerated today.
 *   - The output is a proxy, never a gauge reading, and must always be
 *     labelled as one.
 */

/** Ordered (date, rain) pairs, one entry per day, no gaps, 2016 start. */
export interface WaterLevelHistoryDay {
  date: string; // ISO YYYY-MM-DD
  rainfallMm: number;
}

export interface DerivedWaterLevel {
  /** metres, two decimals, same rounding the dataset used */
  waterLevelM: number;
}

const QUICK_RECESSION = 0.8;
const SLOW_RECESSION = 0.97;
const SLOW_INTAKE = 0.06;
const QUICK_GAIN_M_PER_MM = 0.012;
const SLOW_GAIN_M_PER_MM = 0.03;
const DRY_SEASON_DROP_M = 2.0;
const P98 = 98.0;
const P_TOP = 99.9;

function reservoirIndex(rainfallMm: number[]): Float64Array {
  const index = new Float64Array(rainfallMm.length);
  let quick = 0;
  let slow = 0;
  for (let i = 0; i < rainfallMm.length; i += 1) {
    quick = QUICK_RECESSION * quick + rainfallMm[i];
    slow = SLOW_RECESSION * slow + SLOW_INTAKE * rainfallMm[i];
    index[i] = QUICK_GAIN_M_PER_MM * quick + SLOW_GAIN_M_PER_MM * slow;
  }
  return index;
}

/** numpy's default (`linear`) percentile for a pre-sorted copy of `values`. */
function percentileLinear(sorted: number[], percent: number): number {
  const rank = (percent / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const fraction = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

/**
 * Map the stage index onto the river's alarm band, the generator's two-segment
 * mapping: floor→Alarm 1 below p98, Alarm 1→Alarm 3 above it, saturated.
 */
function stageLevels(
  index: Float64Array,
  alarm1: number,
  alarm3: number,
): Float64Array {
  const dryFloor = alarm1 - DRY_SEASON_DROP_M;
  const sorted = Array.from(index).sort((a, b) => a - b);
  const p98 = percentileLinear(sorted, P98);
  const pTop = percentileLinear(sorted, P_TOP);
  const span = alarm1 - dryFloor;
  const levels = new Float64Array(index.length);
  for (let i = 0; i < index.length; i += 1) {
    const value =
      index[i] <= p98
        ? dryFloor + (span * Math.min(index[i], p98)) / p98
        : alarm1 +
          ((alarm3 - alarm1) * (index[i] - p98)) / Math.max(pTop - p98, 1e-9);
    levels[i] = Math.min(value, alarm3);
  }
  return levels;
}

/**
 * Derive water level for every day in `history`. Returns a map from ISO date
 * to the derived level, so callers can look up days they care about and
 * compute day-over-day deltas consistently.
 */
export function deriveWaterLevels(
  history: WaterLevelHistoryDay[],
  { alarm1, alarm3 }: { alarm1: number; alarm3: number },
): Map<string, number> {
  const sorted = [...history].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const rainfall = sorted.map((day) => day.rainfallMm);
  const index = reservoirIndex(rainfall);
  const levels = stageLevels(index, alarm1, alarm3);
  const derived = new Map<string, number>();
  for (let i = 0; i < sorted.length; i += 1) {
    derived.set(sorted[i].date, Math.round(levels[i] * 100) / 100);
  }
  return derived;
}
