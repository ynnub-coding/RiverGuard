# Convex setup, migration and LGU provisioning guide

**Audience.** Whoever runs the RiverGuard deployment — a developer with the
repo checked out and Convex CLI access, or an administrator approving
production changes.

**State as of 2026-11-20.** The code in `convex/` is the source of truth; the
deployment only knows what it has been pushed. A fresh checkout has **no
deployment configured** (`apps/web/.env.local` is absent and gitignored), the
sandbox that built this guide could not reach a deployment, and **none of the
deployment-side steps below have been executed or verified from here**. Every
command that talks to Convex is therefore *your* step to run, and every
verification claim in this repository is limited to `tsc --noEmit`, the
Next.js build and the local fixture-mode smoke runs unless explicitly said
otherwise.

**Non-negotiables.**

- Never paste secret values into chat, logs, issues, docs or the browser.
- `RIVERGUARD_INGEST_SECRET` is server-only. It must **never** be prefixed
  `NEXT_PUBLIC_` and never appear in the browser bundle.
- Do not run `npx convex deploy` against a production deployment, or change
  production env vars / indexes / tables, without explicit owner approval.
- The schema changes shipped with this work are additive-only (optional
  `forecastRuns.locationCode` / `failureReason`, and the pre-existing
  `failed` status). **No migration or backfill is required.**

---

## 1. What talks to Convex, and how

| Caller | Identity | Uses |
| --- | --- | --- |
| Browser (`apps/web`, `"use client"`) | Firebase ID token via `ConvexReactClient` | Queries (`latestOutlook`, `recentRuns`, `getRun`, alerts, `myLguProfile`, …) and mutations that represent *user intent* (`acknowledge`, `resolve`, `submitLguReview`, `ensureCurrent`) |
| Next.js route handlers (`/api/forecast`, `/api/historical`) | **No Firebase identity** — server-to-server | `recordOutlook` / `recordFailure` via `RIVERGUARD_INGEST_SECRET` (or, historically, nothing — now closed) |
| `scripts/import_historical_dataset.mjs` | Server credential | `historical:upsertBatch`, `historical:upsertFloodEvents` |
| `npx convex` CLI | Your Convex login | Push functions, set env vars, dashboard access |
| Convex cron | Deployment clock | `forecasts:failStaleRuns` every 15 min (marks `requested` runs stale → `failed`) |

A row is written to Convex only when a write path above runs. Without a
deployment, `/api/forecast` still works and the run lands in
`.data/runs.json` (this local fallback is labelled in the UI; the local file
is gitignored).

## 2. Identify your deployment (dev vs production)

`apps/web/.env.local` (you create it; never committed) names the deployment:

```
CONVEX_DEPLOYMENT=dev:your-deployment-name        # development
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

- `dev:…` → **development deployment.** Pushing, env changes and function
  edits here are routine. Still no destructive operations.
- A bare name or `prod:…` → **production.** Every push and every env change
  is production-affecting and needs the owner's explicit approval.

Check which one you are pointed at before anything else:

```bash
grep -E '^(CONVEX_DEPLOYMENT|NEXT_PUBLIC_CONVEX_URL)=' apps/web/.env.local
npx convex dashboard        # opens the deployment this checkout targets
```

If you are not sure it is a *development* deployment, stop and ask. Do not
"just try" a push on something unknown.

## 3. Required settings — what exists and what it is for

Do not invent additional names. This is the complete list the code reads.

| Variable | Purpose | Where set | Used by | Format / notes |
| --- | --- | --- | --- | --- |
| `CONVEX_DEPLOYMENT` | Names the deployment the CLI and `convex dev` act on | `apps/web/.env.local` (written by `npm run convex:dev`) | convex CLI | `dev:<name>` or `prod:<name>` |
| `NEXT_PUBLIC_CONVEX_URL` | Browser + server read path for the deployment | `apps/web/.env.local` | web app (all Convex calls) | `https://<deployment>.convex.cloud` — must match `CONVEX_DEPLOYMENT` |
| `CONVEX_URL` | Same deployment, for Node scripts (falls back to `NEXT_PUBLIC_CONVEX_URL`) | shell env when importing | `scripts/import_historical_dataset.mjs` | same URL |
| `RIVERGUARD_INGEST_SECRET` | Server-to-server proof for `recordOutlook` / `recordFailure` / `historical:*` / `observedWeather:upsertDays` when no Firebase identity is present | **Convex deployment env** *and* the web server's env (e.g. `apps/web/.env.local`) | `convex/ingest.ts` (constant-time compare), `/api/forecast` (attaches it), `/api/historical` (via `observation-store.ts`), import script | Generate once, e.g. `openssl rand -hex 32`. Never `NEXT_PUBLIC_`, never in git, never printed. If unset **on the deployment**, no-identity writes are rejected (fail closed) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Convex verifies Firebase ID tokens against this Firebase project | `apps/web/.env.local` **and** Convex deployment env (read by `convex/auth.config.ts` at push time) | `convex/auth.config.ts` — providers `securetoken.google.com/<id>`, applicationID `<id>` | Your Firebase project id, e.g. `your-project-id`. Mismatch = "No auth provider found matching the given token" |
| `NEXT_PUBLIC_FIREBASE_*` (api key, auth domain, sender id, app id, storage bucket) | Web Firebase SDK config | `apps/web/.env.local` | browser Firebase SDK | From the Firebase console; public by design, still do not reuse across projects |
| `WEATHER_PROVIDER`, `WEATHER_ALLOW_FIXTURE` | Weather source; `fixture` = illustrative, clearly labelled | `apps/web/.env.local` | `/api/forecast` | `WEATHER_PROVIDER=open-meteo` (default) / `WEATHER_ALLOW_FIXTURE=false` to fail loudly |
| `ML_API_BASE_URL` | Where the web server finds the inference service | `apps/web/.env.local` or shell | `/api/forecast` | default `http://127.0.0.1:8000` |
| `RUN_STORE_PATH` | Local fallback run store location | shell | `apps/web/src/lib/run-store.ts` | default `<repo>/.data/runs.json` (gitignored) |

**Generating and setting `RIVERGUARD_INGEST_SECRET`** (first time on a dev
deployment — dev-safe):

```bash
# generate one in your shell; the output goes nowhere near this doc
openssl rand -hex 32
npx convex env set RIVERGUARD_INGEST_SECRET <paste-value-here>   # on the deployment
# then put the same value in apps/web/.env.local:
#   RIVERGUARD_INGEST_SECRET=<paste-value-here>
```

Rotating: set a new value on the deployment and in the web env, redeploy/restart,
then import/run a forecast to confirm. The old value stops working the moment
the deployment env is saved — coordinate the web restart.

Production variant of every `convex env set` command above is
**production-affecting** and needs owner approval.

## 4. Firebase auth provider configuration (Convex side)

`convex/auth.config.ts` declares the Firebase issuer:

```ts
{ domain: "https://securetoken.google.com/<NEXT_PUBLIC_FIREBASE_PROJECT_ID>",
  applicationID: "<NEXT_PUBLIC_FIREBASE_PROJECT_ID>" }
```

Requirements for tokens to verify:

1. The deployment was pushed with `NEXT_PUBLIC_FIREBASE_PROJECT_ID` set to the
   **same** project id the web app signs in to (see §3).
2. Firebase Authentication → Sign-in method has the providers you use
   (email/password, Google) enabled.
3. Firebase Authentication → Settings → **Authorized domains** includes your
   dev origin (`localhost`) and whatever origin you serve the app from.
4. The app passes the ID token to Convex; `requireCurrentUser` /
   `requireRole` in `convex/auth.ts` reject anonymous calls.

If any of this is off you get "No auth provider found matching the given
token" (client) or `Authentication is required` / `await requireRole ...`
errors (functions). See §11.

## 5. Deploy the functions

```bash
# development, first time (creates the deployment, writes .env.local) — dev-safe
npm run convex:dev

# development, subsequent syncs (or when you stopped the watcher) — dev-safe
npm run convex:dev        # leave running, or Ctrl-C once it has pushed

# production push — PRODUCTION-AFFECTING, needs owner approval first
npx convex deploy
```

`convex:dev` pushes `convex/`, runs codegen into `convex/_generated/` and
keeps the deployment in sync. The web app reads the deployment through
`NEXT_PUBLIC_CONVEX_URL`; if you pushed to a *different* deployment than the
URL names, the app errors with "Could not find public function" (§11).

**Schema changes in this work.** Additive only: `forecastRuns.locationCode?`,
`forecastRuns.failureReason?`; the `failed` status already existed. Old
documents validate unchanged; no migration, no backfill, no index additions.
If you ever remove fields instead of adding optional ones, that is a
migration and a production decision — do not improvise one.

## 6. Verify the deployment — the fast checklist

All dev-safe. Run them and record actual results before claiming success.

1. **Functions exist.** `npx convex function list` (or the dashboard
   *Functions* tab) shows `forecasts:recordOutlook`, `forecasts:recordFailure`,
   `forecasts:latestOutlook`, `forecasts:recentRuns`, `forecasts:getRun`,
   `lguProfiles:*`, `alerts:*`, `historical:*`, `observedWeather:*`,
   `users:*`, and the `failStaleRuns` cron (dashboard *Scheduled jobs*).
2. **Push is current.** Function list output contains
   `forecasts:recordFailure` and `lguProfiles:provisionLguProfile` — if it
   does not, your push is older than this checkout. Re-push.
3. **Auth works.** Sign in as a resident in the app (needs email verification
   with the Firebase project you configured). "Run forecast" completes and the
   run is marked stored (see §7).
4. **History.** `/admin/research/runs` (researcher) or the run-detail page
   lists the run; a failed attempt from §10 shows status `failed` with the
   stage and a sanitised reason, zero days.

`npx convex function list` may print function names — that is expected. It
does not print env var values.

## 7. Verify a resident can record a forecast

1. Sign up as a **resident** (accounts created with `requestedRole:
   "resident"` activate immediately). LGU/researcher stay `pending` until a
   verified administrator acts — this is deliberate.
2. `Run forecast` with `NEXT_PUBLIC_CONVEX_URL` set and the deployment pushed.
3. Expected: the response carries `persistence: { kind: "convex", stored:
   true, runId: … }` and the UI says the run was stored in Convex.
4. Open the run from history. Days render with probability, rainfall, derived
   water level and reasons exactly as stored.
5. Reload. `latestOutlook` returns the same run without re-calling weather/ML.

What you must **not** see: "Stored on this machine only" (that is the local
fallback — see §11) or a claim of Convex storage alongside a
`stored: false` response.

## 8. Provisioning LGU profiles (jurisdiction assignment)

**Why this section exists.** LGU accounts sign up as `pending` and have **no
jurisdiction** until an administrator provisions one. Empty assignment = fail
closed: every LGU-scoped operation throws

> "This LGU account has no assigned jurisdiction. Ask a RiverGuard
> administrator to provision the lguProfiles row for this account (see
> docs/convex-setup-and-migration-guide.md, §8)."

LGU users can never assign themselves a jurisdiction. Approval is a human
decision made out of band (employment, office, coverage area).

### 8.1 What the administrator does

Precondition: the LGU has signed up in the app and their account exists on
the deployment (created with role `lgu`).

1. **List pending LGU requests** (admin-only; run from the app's admin
   tooling or directly in the Convex dashboard's function runner):
   `lguProfiles:listPendingLguUsers` — returns accounts with
   `status != "active"`, their email, display name, and whatever the signup
   form captured (`organization`, `position`, `requestedArea`, `purpose`).
   Verify the request out of band before approving.
2. **Provision the profile**: `lguProfiles:provisionLguProfile` with
   - `email` — the LGU account's email, exactly as registered;
   - `cityCode` — their primary jurisdiction: one of `quezon-city`,
     `marikina`, `manila`, `pasig` (nothing else is accepted);
   - `assignedLocationCodes` — optional; defaults to `[cityCode]`. All entries
     are validated against the same four codes; duplicates are removed;
   - `organization`, `position` — optional; defaults come from the signup.
   The mutation is idempotent: it upserts the `lguProfiles` row and sets the
   user's `status` to `active`.
3. **Verify**: call `lguProfiles:myLguProfile` as that LGU (or have them open
   the app). It returns the assigned codes, or `null` if something is off.
   Also check the *users* table: `status: "active"`.
4. **Narrowing/widening later**: re-run the provision mutation with a new code
   list. The same action narrows jurisdiction as well as widening it.

Nothing here grants cross-jurisdiction access to anyone else. Residents and
researchers are unaffected by LGU provisioning. Admins are unrestricted.

### 8.2 What LGU users see before provisioning

- They cannot pass the app's LGU gate (account is not active / has no
  assignment) or they see the explicit "no assigned jurisdiction" error —
  never silent success, never unrestricted data.
- After provisioning they see and review exactly their assigned cities.

### 8.3 When provisioning is wrong

- Wrong city list: re-provision with the correct codes. The old row is
  patched in place; no rows are deleted.
- LGU left office: suspend the user (`users` table → `status: "suspended"`)
  via the dashboard, or re-provision to `[]` is not possible — suspension is
  the mechanism, not an empty assignment.
- No location rows: `lguProfiles` keys off `userId` → `users._id`; a stale
  email typo throws "No RiverGuard account found for …" before anything is
  written.

## 9. Creating the first administrator (manual, one-off)

There is deliberately **no self-service path** to an admin account:
`ensureCurrent` rejects `requestedRole: "admin"`, and role changes go through
no public mutation. The **first** admin must be provisioned manually on the
deployment (owner-run; production-affecting if that is production):

1. Have the future admin sign up in the app as a resident (active immediately).
2. In the Convex dashboard → *Data* → `users` table, find their row (search by
   `email`), and patch `role` to `"admin"` and `status` to `"active"`.
3. Verify: the account can call admin-only functions
   (`lguProfiles:listPendingLguUsers` returns rows instead of throwing).
4. Further admins: repeat, but with an *existing* admin doing the patch, or by
   extending the provisioning flow later — never by relaxing
   `ensureCurrent`.

Document who did this and when in your team's access log. This is a privileged
operation; on production it needs the same approval as any deploy.

## 10. History and failed runs — what to expect

- `recentRuns` (history list): completed *and* failed runs. Failed rows carry
  `status: "failed"`, `errorCode` (one of `weather_provider`, `ml_service`,
  `persistence`, `timeout`), and a sanitised `failureReason` (URLs stripped to
  `[url]`, credentials redacted, 300-char cap). Zero days.
- `getRun` (detail): same fields plus `days: []` for a failed run; the UI
  renders a "this run failed — nothing here is model output" panel instead of
  a chart.
- LGU history is jurisdiction-scoped: runs about cities outside the LGU's
  assignment never appear, including failed attempts on those cities.
- A failed run is never acceptable evidence in review or reporting. If you
  see `status: "completed"` with `provider: "fixture"`, that is an
  illustrative run and must be labelled as such wherever it is shown.
- Retrying after a failure creates a new run row; nothing dedupes by request
  — newest first is the rule.

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Could not find public function for 'forecasts:…'" | Push is older than this checkout, or URL names another deployment | `npm run convex:dev`; confirm `NEXT_PUBLIC_CONVEX_URL` matches `CONVEX_DEPLOYMENT`; restart Next |
| "No auth provider found matching the given token" | Deployment lacks the Firebase issuer config, or project id mismatch | §3 (`NEXT_PUBLIC_FIREBASE_PROJECT_ID` on the deployment) + §4; re-push; restart Next |
| "Authentication is required" / "requires an active … account" | Signed out, account `pending`/`suspended`, or wrong role | Sign in; for LGU/researcher wait for approval (§8); suspended accounts stay blocked |
| Every LGU operation throws "no assigned jurisdiction" | Profile never provisioned / provisioned to different account | §8; check `email` matches exactly; confirm `lguProfiles` row exists for that `userId` |
| LGU sees one city only | That is what `assignedLocationCodes` contains | Re-provision with the full list (§8.3) |
| `forecasts:recordOutlook` returns "Stored on this machine only…" | `NEXT_PUBLIC_CONVEX_URL` unset/invalid for the Next server, or write rejected | Set URL, restart Next; if set, check `npx convex logs` for the rejection reason (usually missing `RIVERGUARD_INGEST_SECRET`) |
| Server-side write returns `written: false` / `stored: false` | Ingest secret missing **on the deployment** or mismatched with the web env | Set/rotate on both sides (§3); confirm identical strings; check `convex logs` |
| Historical chart shows bundled data instead of live | `observedWeather:upsertDays` rejected (no ingest secret) — by design it degrades, never 500s | Same fix as above; the chart stays usable |
| `npx convex env set` on production by accident | — | Stop. Tell the owner now. Do not "set it back" without knowing the previous value |
| Import script fails with "RIVERGUARD_INGEST_SECRET is required" | Working as intended; fail-fast guard | Export the same value used on the deployment (§3) |

Getting the actual error: `npx convex logs` (dev log stream) shows function
rejections with arguments redacted. Never paste identifiers that look like
secrets into a public channel.

## 12. Rollback

- **Functions**: re-push the previous known-good commit/tag
  (`git checkout <tag> -- convex/ && npm run convex:dev`, or on production the
  approved `npx convex deploy`). Convex keeps no automatic function history —
  rollback is "push older code", so your deploys should be from tagged,
  reviewed commits.
- **Env vars**: `npx convex env set RIVERGUARD_INGEST_SECRET <previous-value>`
  if you kept one. If you rotated without recording the old value, generate a
  new one and update both sides — there is nothing else to recover.
- **Schema**: this guide's schema delta is additive-optional. If you need to
  fully roll back code, the extra fields simply become unused; leave them
  (removing them is the destructive path — don't).
- **Data written by new code** (`failed` runs with `locationCode`/
  `failureReason`) is harmless history; delete rows only via an explicit,
  approved wipe of dev data, never silently in production.

## 13. What was verified from the build environment vs what you must verify

Verified here (automated, this checkout): `tsc` for `convex/` and the web
app, ESLint (only pre-existing baseline findings, none from this work),
Next.js production build, ML-service-down → `/api/forecast` returns 503 with
`failure: { tracked: true, kind: "local" }` and a `status: "failed"` run in the
local store, and the success path persisting to the local store.

**Not verifiable from here — yours to run:** every deployment-side step
(anything after the `npm run convex:dev` first push), token verification,
ingest-secret enforcement against a live deployment, LGU provisioning, cron
behaviour. Do not represent those as verified until you have run §§5–10 on
your deployment and kept the output.
