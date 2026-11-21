/**
 * The four locations dataset v2 covers, as stable CLI-safe codes.
 *
 * The canonical list lives in `apps/web/src/lib/locations.ts`, and Convex code
 * cannot import from the web app, so the codes are restated here. Keep the two
 * in sync — `data/README.md` (dataset v2) is the source of truth for coverage.
 */

import { normalizeLocationCode } from "./lgu";

export const SUPPORTED_CITY_CODES = [
  "quezon-city",
  "marikina",
  "manila",
  "pasig",
] as const;

export type SupportedCityCode = (typeof SUPPORTED_CITY_CODES)[number];

const SUPPORTED = new Set<string>(SUPPORTED_CITY_CODES);

/** Normalise (case/whitespace) and assert membership; throws otherwise. */
export function assertSupportedCityCode(value: string): SupportedCityCode {
  const code = normalizeLocationCode(value);
  if (!SUPPORTED.has(code)) {
    throw new Error(
      `Unsupported location code "${value}". Supported: ${[...SUPPORTED].join(", ")}.`,
    );
  }
  return code as SupportedCityCode;
}
