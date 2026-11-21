# Overall project scan — 2026-11-20

**Scope:** whole repository at `/home/user/RiverGuard` (apps/web, convex/, services/ml, ml/, data/, docs/, scripts/, .github/, prototype/).
**Method:** static review of every source file plus dynamic verification where possible (`npm run typecheck` ✅ passes, `npm run lint` ❌ fails, `npm run build` ❌ fails on a clean checkout, `pytest services/ml` ❌ 5 failed / 28 passed). No Convex deployment was pushed and no external service was mutated; Open-Meteo was not called from this environment.
**Prepared by:** the same-day full audit requested by the project owner. A prior, narrower audit exists at `docs/report/implementation-audit-2026-11-20.md`; this document supersedes it where they disagree.

Severity legend: **P0** = exploitable or build-breaking, fix before any shared use · **P1** = correctness/integrity, fix soon · **P2** = hygiene/process · **P3** = polish.

---

## 0. The short version

The codebase is unusually well documented for a prototype and its data-honesty posture is good, but it is **not in a releasable or even CI-green state**, and it has **multiple privilege-escalation and unauthenticated-write paths** in the Convex backend. The documentation set contradicts itself about what the product roles even are. Roughly 55% of tracked bytes are committed artifacts that should not be in the repo (a duplicate app, a 9.3 MB zip of the base commit, `.vercel` output).

Verified-by-running status on a clean checkout:

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ passes (web + convex) |
| `npm run lint` | ❌ 4 errors, 2 warnings (`--max-warnings=0`) — `PublicScreens.tsx` ×2, `RoleScreens.tsx` ×4 |
| `npm run build` (no env) | ❌ prerender of `/_not-found` crashes: `FirebaseError auth/invalid-api-key` — Firebase client is initialised at import time |
| `npm run build` (dummy Firebase env) | ✅ builds; 2 Turbopack "dynamic filesystem access" warnings (`run-store.ts`, `gis.ts`) |
| `pytest services/ml` | ❌ 5 failed / 28 passed — tests expect the *old* model artifact (threshold 0.3439, predictions), `ml/artifacts/model.json` was retrained 2026-11-18 (threshold 0.4) |
| CI workflows | ❌ none — only a PR-body attribution-stripper; no build/lint/typecheck/test pipeline at all |

The claim in `docs/report/implementation-audit-2026-11-20.md` that "`npm run build` passes" is only true with Firebase env vars present; it is not reproducible from a clean checkout.

---

## 1. Security — convex/ backend (P0 unless noted)

Convex is reached from the browser with the Firebase-issued token, so every public query/mutation is an internet-reachable endpoint. Auth coverage is inconsistent: some paths check roles, several do not.

1. **P0 — `users.ensureCurrent` lets any signed-in user self-assign `admin`.** The mutation inserts `role: args.requestedRole ?? "resident"` with **no server-side restriction** on the role value. The signup UI only offers resident/lgu/researcher, but the client can send `requestedRole: "admin"` directly. Worse, `status` is set to `pending` only for lgu/researcher, so a self-requested admin lands **active**. Additionally the returned object hard-codes `status: "active"` even for newly inserted `pending` LGU/researcher accounts, so the UI believes pending users are active.
   Fix: server-side allow-list (`resident` only for self-service; lgu/researcher → pending; admin never self-serviceable), and return the real status.

2. **P0 — Unauthenticated mutations write application data.**
   - `observedWeather.upsertDays` — no auth at all. Anyone can insert/overwrite arbitrary "observed" rainfall/temperature, which `/api/historical` then charts as observed truth. Data-poisoning by design.
   - `historical.upsertBatch` — no auth. Worse: it also **inserts/patches `locations` (name, lat, long) and `stations`** and writes `sensorReadings`. Full dataset forgery. The import script works precisely because no auth is required.
   - `historical.upsertFloodEvents` — same.
   Fix: require admin/researcher role (or a dedicated internal mutation + secret for the import script), or make these `internalMutation` and drive imports from a trusted runner.

3. **P0 — Unauthenticated reads that bypass the role model.**
   `historical.listForLocation`, `historical.getImportStatus`, `riskAssessments.latestForLocation`, `predictions.listForLocation`, `sensorReadings.listWindow`, `stations.listAvailable`, `stations.getByCode`, `hazardLayers.listActive`, `observedWeather.listRange` — none call `requireCurrentUser`/`requireRole`. Some are low sensitivity, but they silently bypass the role consolidation the docs describe; each needs an explicit decision (authenticated or deliberately public).

4. **P0/P1 — Alert authorisation gaps.**
   - `alerts.acknowledge` / `alerts.resolve` check role (lgu/admin) but **not location scope** — an LGU for Marikina can acknowledge/resolve alerts for Manila/Pasig/Quezon City. Every other LGU-scoped path goes through `assertLocationAccess`; these missed it.
   - `alerts.listForLocation` / `listOpenForLocation` allow any resident/lgu/admin with no location scoping (residents may be world-readable by design — decide deliberately).
   - `acknowledge(args.acknowledgedBy)` accepts `acknowledgedBy` and **ignores it** (uses `user._id`) — dead, misleading parameter.

5. **P1 — `forecasts.failStaleRuns` is a public mutation.** Any client can call it; it must be `internalMutation` (invoked by the cron). It is also dead code in practice: `recordOutlook` always inserts runs with `status: "completed"`, so no `requested` rows ever exist for it to fail. Either implement the requested→completed lifecycle or remove the cron.

6. **P1 — `forecasts.latestOutlook` picks the newest completed run *globally*, then filters that run's forecasts by `locationCode`.** If the latest run was a different city, the dashboard for the requested city gets `null` (or days only after manual slicing). It must select the newest completed run **having a forecast row for this location** (e.g. via `by_location_valid_at` on forecasts → run), not "newest run, then filter".

7. **P1 — Mixed-location run handling is inconsistent.** `forecasts.recentRuns` shows an LGU any run whose *locations intersect* their assignment (good), but `forecasts.getRun` calls `assertLocationAccess` **per forecast** and throws if *any* forecast is outside the assignment — so the detail page hard-fails for exactly the runs the list shows. Filter days by scope or reject the run consistently. (Single-location runs make this latent today; the review flow has the same shape.)

8. **P1 — `recordOutlook` accepts an unbounded `days` array.** Validators cap nothing; a crafted call can write thousands of forecast rows per run. Cap `args.days.length` (≤ 14) and sizes of `reasons` strings.

9. **P2 — `auth.config.ts` throws at module scope** when `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is unset. Clear failure, but it takes down *all* Convex functions on a missing env rather than the auth-dependent ones. Acceptable if intentional; document it in SETUP.md.

10. **P2 — `convex/observedWeather.ts` imports `./_generated/server`** while every other module deliberately uses the generic `*Generic` builders to build without deploy. It works only because `convex/_generated/*` is committed; keeping generated code in sync by hand is fragile. Either commit codegen everywhere consistently (and regenerate in CI) or use the generic builders.

## 2. Security — Next.js app & API routes (P0 unless noted)

11. **P0 — No API route requires authentication.** Every route under `app/api/**` is anonymously callable:
    - `POST /api/forecast` — burns Open-Meteo calls and local ML inference for any anonymous caller; persistence silently fails (`recordOutlook` rejects without a token → warning "The run was not stored", which also confuses residents by design).
    - `GET /api/historical` — **has side effects**: on a cache miss it fetches Open-Meteo and writes to Convex (`upsertDays`, unauthenticated — see #2). A GET, triggerable by any crawler/prefetcher, can flood provider calls and Convex writes. Make it POST, or require auth + same-origin check + rate limit.
    - `GET /api/contributions` — same provider+ML burn.
    - `GET /api/runs`, `/api/runs/[id]` — exposes the local fallback run store to anyone who can reach the port (local-only deployment, but binding is 0.0.0.0 by default → LAN-reachable).
    - `GET /api/dataset`, `/api/model` — read-only; low risk.
    At minimum: verify a Firebase ID token (or same-origin + secret) on the compute routes, and add basic rate limiting / `Cache-Control: no-store` where applicable.

12. **P0/P1 — Degraded-mode gate fails open.** When `NEXT_PUBLIC_CONVEX_URL` is missing/invalid, `WorkspaceGate` renders `FirebaseOnlyGate`, which checks only that *some* Firebase user is signed in — **any signed-in Firebase account gets every workspace, including `/admin`** (role is unknowable without Convex, and the gate waves everyone through). Fail closed instead: without Convex, render "workspace unavailable" for role-gated sections (or keep Firebase-only only for resident, and deny admin/lgu). Note `convex-config.ts` normalisation is good; the gate built on top of it is not.

13. **P1 — `next.config.ts` `allowedDevOrigins` hard-codes a personal ngrok tunnel** (`atlas-unadorned-pediatric.ngrok-free.dev`) and a wildcard `*.e2b.app`. Remove the ngrok origin; keep the wildcard only if preview deploys are intended, and then document it.

14. **P1 — Error responses leak internals.** Route handlers return `detail: error.message` (file paths, Convex URLs, provider payloads). Fine on localhost; information disclosure the moment this is reachable by others. Gate detailed errors behind `NODE_ENV !== "production"`.

15. **P2 — `GET /api/version` discloses `node: process.version` and build stamp.** Harmless locally; drop `node` in shared deployments.

16. **P2 — No HTTP security headers.** No CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, or document-level `Referrer-Policy` beyond the metadata default. For a localhost-only tool this is minor; required before any shared deployment. (OSM attribution/referer constraints still apply — keep `strict-origin-when-cross-origin`.)

17. **P2 — maplibre-worker route** reads `node_modules/maplibre-gl/...` relative to `process.cwd()` per request and serves it `immutable, max-age=1y` without content hashing; breaks under a standalone/production build. Copy the worker into `public/` at build time instead.

18. **P2 — Firebase client initialised at import time** (`lib/firebase.ts`) with possibly-undefined config → the entire app (including `/_not-found` prerender) crashes when env is absent. This is what makes `npm run build` fail on a clean checkout (§0). Follow the same degradation pattern as `convex-config.ts`: export a nullable `firebaseAuth`, and have auth screens render "configured for local demo only" instead of crashing.

19. **P2 — `firebase` is a dependency of the root workspace** (`package.json`), imported only by `apps/web` (hoisted, undeclared). Declare it in `apps/web/package.json`.

20. **P3 — `NEXT_PUBLIC_DEV_BYPASS_AUTH`** is correctly gated to `NODE_ENV === "development"`; keep the gate, and never ship it in a Vercel-like env.

## 3. Correctness & model integrity (P1 unless noted)

21. **P1 — ML test suite is stale/red.** `services/ml/tests/test_health.py` expects `operatingThreshold == 0.3439` and the risk tests expect pre-retrain probabilities; `model.json` (2026-11-18) reports 0.4 and different outputs. Fix by pinning artifact expectations to the committed model (or by hashing the artifact in a fixture) — and then enforce `pytest` in CI. As committed, the model runtime's own contract tests fail, so any retraining silently invalidates them.

22. **P1 — Forecast-path soil-moisture input is effectively constant.** `lib/weather/open-meteo.ts` never requests `et0_fao_evapotranspiration` (it reads `payload.daily?.et0_fao_evapotranspiration`, always `undefined`), so the soil bucket warm-up always uses the documented default `3.8 mm`. The history adapter (`weather/observed.ts`) *does* request ET0 — the two paths disagree. Consequence: the "model explanation" for soil moisture is partly theatre. Request ET0 (one variable) or remove the dead read and say the ET term is zero-assumed.

23. **P1 — The model does not model measured floods.** Dataset v2 derives `WaterLevel_m`, `SoilMoisture_pct` and `FloodOccurrence` from rainfall by formula; test ROC-AUC 0.9935 / R² 0.9969 measure recovery of the generator. Only 46 positive test rows (1.69%). Only Marikina alarm levels are PAGASA/MDRRMO-verified; the other three cities' alarms are "representative". The docs disclose all this (docs/ml-methodology.md) — keep that labelling enforced in the UI, never market these numbers as forecast skill, and treat the ML metrics card as "pipeline validation".

24. **P1 — `GET /api/historical` doubles as a cache warmer with write side effects** (see #11). Beyond abuse risk, the write path reuses `upsertDays` without a server-side authn story; a legitimate deployment needs a service credential or an internal mutation.

25. **P2 — `next_day` endpoint scores the model twice** (calls `daily_forecast` then rebuilds inputs and re-predicts). Cache the single-day computation.

26. **P2 — Contribution sweep is O(2N) full inferences per request** via `explainability.contributions`; fine at this size, but document the bound.

27. **P3 — `annotate` consistency:** `summarise()` clamps `antecedent7 = max(3d, 7d)` and `antecedent30 = max(7d, 30d)`; correct for monotone sums, worth a comment in code (there is one, keep it).

## 4. Routing, flows, UX (P1–P2)

28. **P1 — Unknown sections render the landing page with HTTP 200.** `PrototypeRouter` falls through to `<WelcomeScreen />` for any unmatched `section`, and there is no `notFound()` anywhere. `/definitely-not-a-page` returns 200 and looks like the homepage. Add `not-found.tsx` and call `notFound()` for unknown sections.

29. **P1 — Documentation contradicts implementation on roles (three ways).**
    - `README.md` says three roles, research tools under `/admin/research/*`, and "`/researcher/*` URLs redirect" — **no redirect exists**; `/researcher` is a fully mounted, gated workspace.
    - `docs/architecture/role-consolidation.md` ("Accepted") says Researcher is removed; the code, the signup role dropdown, and Convex validators all still have `researcher` as a first-class role (`WorkspaceGate role="researcher"`, `ResearcherScreens`, `requireRole(... "researcher")`).
    - `docs/AUTH_ROUTING.md` documents `/researcher` as the real workspace and `/admin/research/*` as a legacy boundary — the reverse of the README.
    Pick one model (current implementation or the role-consolidation decision), implement it (including real redirects in `next.config.ts` if consolidation is chosen), and rewrite the two losing docs. Until then, nobody can say what the routing *is*.

30. **P1 — Admin console shows invented numbers as live status.** `AdminHome` renders "Pending requests 3", "Active users 3", "Supported cities 4" as if from a backend, directly above panels that honestly say "No access requests are recorded". Wire to Convex or label them as design mock values.

31. **P2 — Client-side-only route protection.** No `middleware.ts`; all gating is in client components. Consistent with a local-demo posture, but combined with #11/#12 it means the *only* real enforcement points are Firebase (authn) and Convex (partial authz) — and both have holes above. Any future "share the preview" step exposes everything.

32. **P2 — Location hard-coded to Marikina** across resident/LGU screens and `roleDefinitions[].location`; Quezon City/Manila/Pasig are supported data-wise but the default UI path is Marikina-only. Make the four-city support visible or narrow the claim.

33. **P3 — Three screen files exceed 1,600 lines** (`PublicScreens.tsx` 3,076; `ResearcherScreens.tsx` 2,145; `RoleScreens.tsx` 1,634). No unit/component tests anywhere in `apps/web`. Split by domain and add at least smoke tests for the auth flow and the forecast feed.

## 5. Repository & process (P1–P2)

34. **P1 — ~18 MB of junk is tracked.** Remove from the index (keep or delete on disk as appropriate):
    - `RiverGuard-main-base.zip` — 9.3 MB full copy of the base commit.
    - `prototype/` — 299 files / ~6.9 MB: a superseded TanStack Start + PGlite app with committed `.vercel/output` (69 files of build artifacts), `.grok/` AI tooling incl. `preview.log`, `og-*.png/jpg`, and its own `AGENTS.md`/`vercel.json` (an alternate deployment of the same product). Two sources of truth; delete or archive outside the repo.
    - `data/dataset_preview.html` (770 KB, generated), `services/ml/riverguard_ml.egg-info/` (build metadata; add to `.gitignore`).
    - `design-qa.md` embeds absolute paths from a workstation (`C:\Users\ta1yi\Downloads\...`) — sanitise.
    - Tracked image weight: `apps/web/public/images/*.png` ≈ 5.4 MB — generate compressed WebP/AVIF (or accept weight for local use, document it).

35. **P1 — No CI.** The only workflow is a PR-body attribution stripper (which also *fails* any PR whose commits carry bot co-author trailers — unusual automation that rewrites contributors' PRs; keep if intentional, but it is not a correctness gate). Add a minimal pipeline: `npm ci`, `typecheck`, `lint`, `build` (with dummy Firebase env), `pytest services/ml`, and the GIS verify script. Otherwise §0 guarantees regressions ship unnoticed.

36. **P2 — Single squashed commit** (`1824489`). No reviewable history; mistakes are invisible. Not fixable retroactively — start meaningful commits now.

37. **P2 — Turbopack trace warnings:** dynamic filesystem access in `run-store.ts`/`gis.ts`/`dataset.ts` makes the tracer include the whole project in server output. Scope paths statically (e.g., always under an env-checked root) or add the documented ignore comments.

38. **P2 — `npm run build` and clean-checkout reproducibility** (§0, #18): the project documents "clean checkout works" (SETUP.md) — it doesn't for build/lint/tests. Make the documented command list actually pass.

39. **P2 — Docs drift inventory:** README §2.2 describes a replaced dataset ("archive (2)(1).zip", 7,308 rows, 2016–2020) vs the committed v2 (15,884 rows, synthetic + ERA5 tail, `data/generate_dataset.py`); README "roles" paragraph (see #29); `.env.example` says 7 forecast days while `open-meteo.ts` requests 8; `implementation-audit-2026-11-20.md` claims build/typecheck pass (lint is red); `SETUP.md` ↔ README role text; `docs/report/ui-ux-audit-2026-11-17.md` unreviewed against current UI. Institute a doc-owner and re-derive numbers from source-of-truth artifacts.

40. **P3 — Empty/dead modules committed:** `convex/http.ts`, `convex/mlActions.ts`, `lib/api.ts`, `lib/convex.ts`, `components/alerts/AlertList.tsx`, `components/dashboard/StationCard.tsx`. Delete.

41. **P3 — License/data provenance:** `data/README.md` is excellent (synthetic vs ERA5 split, Ulysses anchor verified). Ensure `data/gis/manifest.json` example stays the template and no real geometry lands without `npm run gis:verify` passing — the gate exists and works; keep it enforced in review.

42. **P3 — OSM tile dependency** is handled unusually carefully (attribution, no prefetch, provider switch, 403 guidance). It remains non-shareable; README already says so. If a shared deployment ever happens, self-host tiles first.

## 6. What is genuinely good (keep)

- Data honesty: synthetic-vs-observed labelling, `alarmsVerified`, rainfall-source provenance, water-level-as-proxy disclaimers, empty states instead of invented numbers, verified-GIS gate (`gis:verify` + manifest + sha256 recheck at serve time).
- Degradation design: fixture fallback is opt-in and loud; Convex absence degrades the app instead of white-screening (see #12 for the gate-side gap); run-store fallback keeps history local.
- `convex-config.ts` URL normalisation, `convex-query.ts` throw-free query wrapper, observation-store batching, atomic JSON writes with a serialised queue, sha256 checks on GIS files.
- SETUP.md quality, `services/ml` test breadth (28 passing), deterministic dataset seed, documented model caveats in `model.json` itself.

## 7. Recommended fix order

**Week 1 (P0):** #1, #2 (auth or internal mutations for all writers), #3, #11 (auth on API compute routes; POST or rate-limited + same-origin for `historical`), #12 (fail closed), #13, #17 (drop committed ngrok domain), #18 (lazy Firebase init) — then get `npm run build`, `lint`, and `pytest` green (#21) and add CI (#35).
**Week 2 (P1):** #6 (latestOutlook), #4, #7, #8, #22, #28, #29/#30 (pick a role model; fix docs; wire or label admin metrics), #34 (purge artifacts), #24.
**Week 3 (P2/P3):** #5, #9, #10, #14–#20, #25–#27, #31–#33, #36–#42.

**Do not** deploy this to any shared/public host before Week 1 *and* #29 are done; the auth model is not enforceable as written.

---

*Verification commands used: `npm run typecheck`, `npm run lint`, `npm run build` (clean env and with dummy Firebase env), `python -m pytest services/ml`, static review of all files under `apps/web/src`, `convex/`, `services/ml/`, `scripts/`, `docs/`, `.github/`, `data/`, `prototype/` (listing only). No production or third-party state was modified.*
