/**
 * Writes a completed outlook somewhere it can be read back.
 *
 * Two stores, one call:
 *   - Convex, when `NEXT_PUBLIC_CONVEX_URL` is set — the shared deployment;
 *   - the local file store (`lib/run-store.ts`) when it is not, so run history,
 *     run detail and the comparison screen still have records to read on a
 *     machine with no deployment.
 *
 * Deliberately server-side and best-effort: a storage hiccup must not destroy a
 * forecast the user already paid for with a weather call and an ML call. The
 * route reports what happened instead of throwing.
 */

import { ConvexHttpClient } from "convex/browser";

import {
  convexErrorHint,
  convexFunctions,
  convexUrl,
  type RecordFailureArgs,
  type RecordFailureStage,
  type RecordOutlookArgs,
} from "./convex-functions";
import type { MlForecastResponse } from "./ml-client";
import { recordLocalFailure, saveLocalRun } from "./run-store";
import type { WeatherBundle } from "./weather";

export interface PersistenceResult {
  /** Which store took the run. `none` means it was not stored at all. */
  kind: "convex" | "local" | "none";
  enabled: boolean;
  stored: boolean;
  runId?: string;
  alerts?: number;
  error?: string;
}

export function persistenceEnabled(): boolean {
  return Boolean(convexUrl);
}

export async function persistOutlook(
  bundle: WeatherBundle,
  forecast: MlForecastResponse,
  issueDate: string,
  accessToken?: string | null,
): Promise<PersistenceResult> {
  if (!convexUrl) {
    // No deployment: keep the run on this machine so history, detail and
    // comparison still work. This is a fallback, not a second source of truth —
    // nothing is written here once Convex is configured.
    try {
      const run = await saveLocalRun({
        locationCode: forecast.locationCode,
        locationName: forecast.locationName,
        issueDate,
        provider: bundle.provider,
        providerDegraded: bundle.degraded,
        retrievedAt: Date.parse(bundle.retrievedAt),
        modelVersion: forecast.meta.modelVersion,
        modelKind: forecast.meta.modelKind ?? null,
        featureSchemaVersion: forecast.meta.featureSchemaVersion,
        operatingThreshold: forecast.meta.operatingThreshold,
        warning: forecast.meta.warning,
        days: forecast.days.map((day) => ({
          date: day.date,
          horizonDays: day.horizonDays,
          rainfallMm: day.rainfallMm,
          probability: day.probability,
          waterLevelM: day.waterLevelM,
          riskLevel: day.riskLevel,
          alertLevel: day.alertLevel,
          exceedsOperatingThreshold: day.exceedsOperatingThreshold,
          reasons: day.reasons,
        })),
      });
      return {
        kind: "local",
        enabled: true,
        stored: true,
        runId: run.runId,
        alerts: run.alerts,
      };
    } catch (error) {
      return {
        kind: "none",
        enabled: false,
        stored: false,
        error:
          error instanceof Error
            ? `local run store: ${error.message}`
            : "local run store failed",
      };
    }
  }

  // This server has no Convex identity of its own. When the caller had a
  // Firebase identity it wins (server-side verification decides their role and
  // jurisdiction); otherwise this project's server credential is presented,
  // never a client-supplied value.
  const serverSecret = accessToken
    ? null
    : (process.env.RIVERGUARD_INGEST_SECRET ?? null);

  const args: RecordOutlookArgs = {
    locationCode: forecast.locationCode,
    locationName: forecast.locationName,
    issueDate,
    provider: bundle.provider,
    providerDegraded: bundle.degraded,
    retrievedAt: Date.parse(bundle.retrievedAt),
    modelName: "RiverGuard test model",
    modelVersion: forecast.meta.modelVersion,
    featureSchemaVersion: forecast.meta.featureSchemaVersion,
    operatingThreshold: forecast.meta.operatingThreshold,
    warning: forecast.meta.warning,
    ...(serverSecret ? { serverSecret } : {}),
    days: forecast.days.map((day) => ({
      date: day.date,
      horizonDays: day.horizonDays,
      rainfallMm: day.rainfallMm,
      probability: day.probability,
      waterLevelM: day.waterLevelM,
      riskLevel: day.riskLevel,
      alertLevel: day.alertLevel,
      exceedsOperatingThreshold: day.exceedsOperatingThreshold,
      reasons: day.reasons,
    })),
  };

  try {
    const client = new ConvexHttpClient(convexUrl);
    if (accessToken) {
      client.setAuth(accessToken);
    }
    const result = await client.mutation(convexFunctions.recordOutlook, args);
    return {
      kind: "convex",
      enabled: true,
      stored: true,
      runId: result.runId,
      alerts: result.alerts,
    };
  } catch (error) {
    return {
      kind: "convex",
      enabled: true,
      stored: false,
      error:
        error instanceof Error
          ? convexErrorHint(error)
          : "unknown Convex error",
    };
  }
}

export interface FailurePersistenceResult {
  tracked: boolean;
  kind: "convex" | "local" | "none";
  error?: string;
}

/**
 * Best-effort record of a failed forecast attempt.
 *
 * Never throws: a failure to log a failure must not mask the original error
 * the caller is handling. The route surfaces `tracked: false` in its own
 * response so the UI can say the failure was not logged.
 */
export async function persistFailure(input: {
  locationCode: string;
  locationName?: string;
  provider?: string;
  providerDegraded?: boolean;
  retrievedAt?: number;
  failureStage: RecordFailureStage;
  reason: string;
  accessToken?: string | null;
}): Promise<FailurePersistenceResult> {
  const failureReason = sanitiseReasonForStorage(input.reason);

  const serverSecret = input.accessToken
    ? null
    : (process.env.RIVERGUARD_INGEST_SECRET ?? null);

  const args: RecordFailureArgs = {
    locationCode: input.locationCode,
    locationName: input.locationName,
    provider: input.provider,
    providerDegraded: input.providerDegraded,
    retrievedAt: input.retrievedAt,
    failureStage: input.failureStage,
    failureReason,
    ...(serverSecret ? { serverSecret } : {}),
  };

  if (!convexUrl) {
    try {
      await recordLocalFailure({
        locationCode: input.locationCode,
        locationName: input.locationName ?? input.locationCode,
        provider: input.provider,
        providerDegraded: input.providerDegraded,
        retrievedAt: input.retrievedAt,
        failureStage: input.failureStage,
        failureReason,
      });
      return { tracked: true, kind: "local" };
    } catch (error) {
      return {
        tracked: false,
        kind: "none",
        error:
          error instanceof Error
            ? `local failure store: ${error.message}`
            : "local failure store failed",
      };
    }
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    if (input.accessToken) {
      client.setAuth(input.accessToken);
    }
    await client.mutation(convexFunctions.recordFailure, args);
    return { tracked: true, kind: "convex" };
  } catch (error) {
    return {
      tracked: false,
      kind: "convex",
      error:
        error instanceof Error
          ? convexErrorHint(error)
          : "unknown Convex error",
    };
  }
}

/** Mirror of the server-side sanitiser: keep storage reader-facing. */
function sanitiseReasonForStorage(reason: string): string {
  let text = String(reason ?? "").slice(0, 300);
  text = text.replace(/https?:\/\/\S+/gi, "[url]");
  text = text.replace(
    /(bearer|token|secret|key)\s*[:=]\s*\S+/gi,
    "$1=[redacted]",
  );
  return text.trim() || "Unknown failure.";
}
