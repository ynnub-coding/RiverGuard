/**
 * One honest way to render a model probability.
 *
 * Rules:
 *  - a missing value is "—", never "0%" — missing and zero are different claims;
 *  - an out-of-range or NaN value is "—" as well (the model contract says 0–1);
 *  - exactly 0 renders as "0%" (a true zero from the artifact, e.g. the dry-season
 *    floor of the calibrated classifier, is a real observation, not an error);
 *  - below 0.1% renders as "<0.1%" so tiny-but-nonzero probabilities are visible;
 *  - below 10% uses two decimals (0.50% – 9.99%); from 10% up, one decimal.
 */

export function formatProbability(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return "—";
  if (value < 0 || value > 1) return "—";

  const pct = value * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  if (pct < 10) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

/** Signed delta between two probabilities, in percentage points, two decimals. */
export function formatProbabilityDelta(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return "—";
  const pp = value * 100;
  const sign = pp >= 0 ? "+" : "";
  return `${sign}${pp.toFixed(2)} pp`;
}

/** True when the caller has a real number to format (used to pick labels). */
export function hasProbability(
  value: number | null | undefined,
): value is number {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
