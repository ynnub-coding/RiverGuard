# RiverGuard — Phase 1–8 implementation report

**Date:** 2026-11-20 · **Branch:** `arena/574998bc-riverguard` (from `1824489`)
**Scope:** the approved Phase 1–8 work order (forecast persistence,
explainability, map improvements). Not in scope / not done: the Colab
notebook, the unauthorized P0/P1 auth fixes and marikina hard-coding from a
prior attempt, any production deploy, any credential rotation.

**Nothing in this report claims Convex-deployment verification.** The
deployment is unreachable from the build environment; all deployment-side
behavior is specified in `docs/convex-setup-and-migration-guide.md` and is
pending the steps in §6–§10 there.

---

## Phase 1 — Port audit (summary)

`origin/main` carries 59 differing files; this branch ports **only** the
safely-portable persistence and auth fixes, rewritten to this branch's
architecture (single-role `users.role`, local `assertLocationAccess` without
opt-out lists). Ported: resident authorization in `recordOutlook`,
`latestOutlook` per-location read, server-ingest credential
(`RIVERGUARD_INGEST_SECRET`) for forecast **and** historical **and**
observed-weather writes, jurisdiction checks on LGU mutations, admin-only LGU
provisioning (new), failed-run recording. **Not merged wholesale**; no UI
rewrite; role layouts preserved.

## Phase 2 — Persistence and authorization

**P2-A — success persists, honest storage reporting.**
`POST /api/forecast → weather → ML → persistOutlook → Convex|local` unchanged in
structure; on Convex write failure the response says `stored: false` with the
error and the UI renders "not stored" (never claims saved). Success rows record
`requestedBy` (server-credential path leaves it absent by design), server-set
`requestedAt`/`completedAt`, validated `locationCode`, full day inputs/outputs.

**P2-B — resident authz, no role trust from the client.** `recordOutlook` /
`recordFailure` accept either a verified deployment credential
(`RIVERGUARD_INGEST_SECRET`, compared constant-time, fail-closed) or any active
account with role admin/lgu/researcher/resident — resident included, per the
origin/main design — with LGU calls additionally pinned to their jurisdiction
by `assertLocationAccess`. Identity always comes from the verified Convex auth
context; the client cannot nominate a userId or role. Fixed during hardening:

- `users.ensureCurrent` accepted `requestedRole: "admin"` → self-registered
  **active admin**. Now rejected; admins exist only via manual provisioning
  (guide §9). It also returned `status: "active"` for lgu/researcher signups
  actually stored as `pending`; the return now reflects stored state.
- `historical:upsertBatch` / `upsertFloodEvents` / `observedWeather:upsertDays`
  had **no authorization at all** (data-poisoning / clobbering of the shared
  observed-weather store). All three now require the ingest credential or an
  admin (`assertIngestAuthorized`); the import script and
  `observation-store.ts` attach it server-side and fail fast with a clear
  message.
- Alert `acknowledge`/`resolve` now fetch the alert and enforce jurisdiction;
  the client-supplied `acknowledgedBy` argument was removed. Alert **list**
  queries are now jurisdiction-scoped too (LGU sees only assigned cities).
- `getRun` for a **failed** run (no forecast rows) previously skipped the
  jurisdiction loop; it now holds the same boundary via `run.locationCode`.

**P2-C — LGU provisioning (was: no writers anywhere).** New
`convex/lguProfiles.ts`: admin-only `listPendingLguUsers`,
`provisionLguProfile` (validates the four supported codes, upserts
`lguProfiles`, activates the pending account; idempotent; empty codes
rejected), `myLguProfile`, `supportedCityCodes`. LGU users can never assign
themselves a jurisdiction; pending/unassigned accounts fail closed with an
explicit error that names the fix (`docs/convex-setup-and-migration-guide.md`
§8). No unrestricted access is granted anywhere.

**P2-D — per-location latest.** `latestOutlook` now walks newest completed
runs and probes each for rows of the requested city (cap 40 runs); a global
newest run no longer masks every other city. Respects the same location
authz. History (`recentRuns`) remains readable with jurisdiction filtering.

**P2-E — failed attempts are first-class and never shown as forecasts.**
Non-OK responses from `/api/forecast` (weather_provider / ml_service) call new
`persistFailure` → `forecasts:recordFailure` (best-effort, never throws) or
the local store. Failed runs are `forecastRuns` rows: `status: "failed"`,
`errorCode` (stage), sanitised `failureReason` (URLs→`[url]`, credential-ish
pairs redacted, 300-char cap), `locationCode`, **zero days/assessments/alerts**.
`recentRuns`/`getRun` surface these fields; the run-detail screen renders a
"this run failed — nothing here is model output" panel; history shows
`Failed · <stage>`; the failure path was executed and verified locally
(see below). Schema delta is **additive-optional only** — no migration.

**Storage failure honesty.** `persistence: { kind, enabled, stored, error? }`
flows to every screen; fixture runs are always labelled; `stored: false`
renders as not-stored. Failure-tracking state (`failure: { tracked, … }`) is
also returned and now disclosed in the UI ("This attempt was logged as a
failed run" / "could not be logged").

## Phase 3 — Convex guide

`docs/convex-setup-and-migration-guide.md` — deployment identification
(dev vs prod), the complete env-var table (purpose/where/used-by/format, incl.
`RIVERGUARD_INGEST_SECRET`), Firebase issuer config, exact deploy/verify
commands labelled dev-safe vs production-affecting, function-existence check,
resident-record verification, §8 LGU provisioning + jurisdiction assignment +
verification, §9 first-admin bootstrap, history/failure semantics,
troubleshooting table, rollback. No secret values anywhere.

## Phase 4 — Explanations

Reused model output only (no fabricated importances). Researcher panel now
shows: input window provenance (provider, as-of date, rain source, quality
status incl. degraded/fixture state), the model's own `reasons` lines, the
rainfall/soil/probability relationship in words, predicted level vs first
alarm (stating `alarmsVerified` or "representative"), operating threshold,
and the standing disclaimer. Resident `RiskSummary` shows the same disclaimer
("Water level is a model-predicted proxy, not an actual river gauge
reading.") with top-3 reasons. Missing values render `—`, never `0`
(model-input rows, big water level, totals). ModelContributionPanel keeps
artifact-backed deltas, now at 2 decimals.

## Phase 5 — Probability formatting & map honesty

One shared formatter `apps/web/src/lib/probability.ts`: missing/invalid/out
-of-range → `—`; true zero → `0%`; `<0.1%` shown as such; <10% at 2dp;
≥10% at 1dp; signed pp deltas at 2dp. Applied at every probability call site
(map chips, chart tooltip/chips, forecast cards, run history, contribution
panel). Map text now distinguishes (1) city-level ML values per city chip/popup
(never geometry), (2) verified static hazard layers (none loaded; verifier
enforced), (3) no street/barangay capability — explicitly, in-panel.

## Phase 6 — GIS

`docs/gis-overlay-implementation-plan.md`. Documents: current empty-but-verified
pipeline (`gis:verify`, provenance requirements), required WGS84 GeoJSON +
bbox/ring/property checks, candidate publishers (PSA PSGC, NAMRIA, OSM,
DOST-ASTI/NOAH, DENR-MGB, PAGASA, local DRRM) with licence-review caveats,
the preconditions for a city choropleth (verified city boundary geometry,
per-polygon labelled "city-level estimate", "no run" neutral state, separate
legend — and it is **not implemented** until the boundary file passes
verification), and why barangay-level is out (three independent blockers;
city values must never be distributed across barangays). No geometry added;
no verifier weakened.

## Phase 7 — What was actually run

| Check | Result |
| --- | --- |
| `npm run convex:typecheck` (tsc, `convex/`) | **pass** |
| `npm run typecheck` (web + convex) | **pass** |
| `npm run lint` | **6 findings — identical to the pre-edit baseline.** 4 errors: PublicScreens `no-explicit-any` ×2 (2406, 2407) + setState-in-effect (PublicScreens 2435, RoleScreens 270 — resident-preferences effect); 2 warnings: unused `setSaved` (ResearcherScreens 1725, RoleScreens 1285). None introduced by this work |
| `npm run build` (production) | **pass** |
| Fixture success run (`POST /api/forecast`, Marikina, 7 days) | **pass** — stored locally (`.data/runs.json`), reasons present, probability 0.0135 → renders `1.35%` |
| ML-down failure run (Pasig) | **pass** — 503 with `failure:{tracked:true, kind:"local"}`; run row `status:"failed"`, `errorCode:"ml_service"`, 0 days, sanitised reason; visible in `/api/runs`; detail page renders failure panel |
| `node scripts/import_historical_dataset.mjs` without secret | **fails fast** as designed; `--validate-only` passes |
| `python -m pytest services/ml/tests` | **5 failed, 28 passed — pre-existing** (golden artifact/runtime drift; no ML file is modified on this branch; not caused and not fixed here) |
| Typecheck/build after every edit batch | re-run and passing |

Not run / not passable here: weather-provider-failure without fixture (the
sandbox dev server runs with `WEATHER_ALLOW_FIXTURE=true`; restarting it is the
owner's call), anything against a live Convex deployment (see guide §§5–10),
ML golden-value tests (see above). The `prototype/` directory is a separate
Vite app unrelated to these changes; its suite was not run.

## Phase 8 — Files, Convex surface, and pending actions

**New files:** `apps/web/src/lib/probability.ts`, `convex/ingest.ts`,
`convex/cityCodes.ts`, `convex/lguProfiles.ts`,
`docs/convex-setup-and-migration-guide.md`, `docs/gis-overlay-implementation-plan.md`.
**Modified:** 25 files (see `git diff --stat`). **Preserved untouched:**
`docs/report/*-2026-11-20.md` (untracked, pre-existing).

**Convex functions:** `recordOutlook` (resident auth + per-location store),
`latestOutlook` (per-location), `recentRuns` (failed-run fallback + error
fields), `getRun` (error/location fields + failed-run jurisdiction),
`failStaleRuns` (internal), new `recordFailure`, `lguProfiles:*` (new),
`alerts:*` (jurisdiction scoping), `historical:upsertBatch`/`upsertFloodEvents`
and `observedWeather:upsertDays` (ingest-credential required),
`users:ensureCurrent` (no self-registered admins; honest stored status).
**Schema:** additive optional `forecastRuns.locationCode` / `failureReason`;
no migration required.

**Env vars to configure (owner action, not set here):**
`RIVERGUARD_INGEST_SECRET` on the deployment **and** the web server env
(never `NEXT_PUBLIC_*`); `NEXT_PUBLIC_FIREBASE_PROJECT_ID` on the deployment
(read by `auth.config.ts`); existing `NEXT_PUBLIC_CONVEX_URL` must name the
same deployment that was pushed.

**Manual actions pending your decision:** run guide §§5–10 on your
deployment; create the first admin (§9); provision LGU accounts (§8); rotate
nothing without a plan; approve any production push. **Production-affecting:**
`npx convex deploy`, all production `convex env set`, any admin/user patches —
none of these was performed.

**Remaining limitations:** LGU screens still hard-code Marikina (pre-existing,
out of the authorized scope); the failure panel reaches the researcher and
dashboard surfaces but the shared chart panel shows only the raw error string;
fixture mode remains the offline weather path by design; ML golden tests are
red on this branch base; map choropleth requires verified city boundary
geometry (does not exist yet — see the GIS doc).
