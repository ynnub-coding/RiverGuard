# Defense readiness — RiverGuard NCR (2026-11-20, second pass)

**Context:** Defense is tomorrow. This second-pass scan re-verified the repository in a fresh
environment (`npm ci` from lockfile), then the project was exercised end-to-end as a demo.
It supersedes the verification matrix in `docs/report/overall-scan-2026-11-20.md` where they
differ. Everything in §0 was **run today**, not assumed.

---

## 0. Verified status today

| Check | Result |
| --- | --- |
| `npm ci` (fresh) | ✅ 580 packages, ~18 s |
| `npm run typecheck` (web + convex) | ✅ passes |
| `npm run lint` | ❌ **4 errors, 2 warnings** (`PublicScreens.tsx` ×2 unused-var/no-html links, `RoleScreens.tsx` ×4 — setState-in-effect + unused `setSaved`) |
| `npm run build` with dummy Firebase env | ✅ succeeds; `/`, `/design-system` static; 14 dynamic routes |
| `npm run dev` **without** Firebase env | ❌ `/`, `/design-system`, every route → **HTTP 500** (`FirebaseError: auth/invalid-api-key`, digest 4247819108) — reproduced live |
| `npm run dev` **with** dummy Firebase env | ✅ `/`, `/design-system`, `/resident`, `/lgu`, `/admin`, `/researcher` all **HTTP 200**; `/definitely-not-a-page` also **HTTP 200** (known defect: unknown sections fall through to the landing page) |
| `pytest services/ml` | ❌ **5 failed / 28 passed** — tests expect the pre-2026-11-18 artifact; `model.json` was retrained (threshold 0.4, different probabilities) |
| CI | ❌ none (only `pr-body-attribution.yml`) |
| Git | 1 squashed commit on branch; 2 untracked report files; ~18 MB tracked junk (base-commit zip, `prototype/`) |
| Notebook for course submission | ⚠️ `notebooks/riverguard_ncr_dataset_walkthrough.ipynb` was created and executed last session but **is no longer present in the workspace** — re-upload from the viewer copy if still open, or ask to rebuild it |

**Demo-critical consequence:** the app must be started with the dummy Firebase env vars for the
live demo, or every screen 500s. For actually *clicking through* the role workspaces without a
backend, set `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` — it is hard-gated to
`NODE_ENV === "development"` in `WorkspaceGate.tsx`, so it cannot weaken a production build.
Rehearse exactly this on the presentation machine. With dummy keys the Firebase sign-in itself
will not succeed, so without the bypass flag the role routes bounce to
`/auth/login?return=/…`.

---

## 1. What the project actually is (say this out loud)

A **locally-executed, research-grade decision-support prototype** for flood-risk screening in
four NCR cities (Quezon City, Marikina, Manila, Pasig), built in ~3 weeks from an empty repo.
It is not a forecasting product and not a warning system. Its value is the *engineering and
honesty methodology*, not the headline metrics.

Defensible claims, every one backed by an artifact in the repo:

1. **A complete data story.** 15,884 rows × 23 columns, deterministic generator (seed 42),
   calibrated to PAGASA 1991–2020 normals, anchored to the documented Ulysses 2020 ERA5 storm,
   with per-row provenance (`RainSource`: synthetic-calibrated / ERA5-anchor / ERA5-reanalysis)
   and a full `data/README.md` reliability statement. Only a handful of student projects ship a
   dataset card this explicit.
2. **Metrics with caveats attached, in the artifact itself.** `ml/artifacts/model.json` carries
   its own warning that scores measure recovery of the generator, not forecast skill;
   `docs/ml-methodology.md` (154 lines) says the same; the evaluation protocol (chronological
   splits, threshold tuned on validation only, locked before test; PR-AUC/Brier/calibration
   instead of accuracy; baselines comparison) is textbook-correct methodology even on synthetic
   labels.
3. **GIS you can trust.** `scripts/verify_gis_layers.mjs` + manifest + sha256 re-check at serve
   time; licensed layers are kept out of git deliberately. This is a *process* result most
   prototypes skip.
4. **Degradation by design.** Opt-in, loud fixture fallback (`WEATHER_ALLOW_FIXTURE`); missing
   Convex degrades the app instead of white-screening; atomic, queued local run store; Convex
   config normalisation with a throw-free query wrapper.
5. **Breadth of surface.** Public site, resident/LGU/researcher/admin workspaces, a seven-day the
   outlook pipeline (Open-Meteo → soil-moisture bucket → model → plain-language explanation),
   design-system route, 44 screen components (~8,200 lines), 288 source files.
6. **Process artefacts.** 33 documents besides code: roadmap phases 1–6, agile practice docs
   (DoR/DoD, kanban, retro, backlog), ADRs, two same-day audits with severity-rated findings,
   a UI/UX audit with device-screenshot QA comparison, a data-sources license ledger, and an
   honest progress report already published to the team (`docs/report/progress-report-2026-11-14.md`).
7. **Verified-Marikina alarms.** `alarms_verified: true` only for Marikina (15/16/18 m,
   PAGASA/MDRRMO); everywhere else explicitly marked representative/secondary-source. Honesty at
   the field level.
8. Reproducible engineering: `npm ci` → 18 s; one documented generator for the data; model
   artifact regenerates end-to-end (`export_check` max abs diff ~3e-9).

---

## 2. What is weak — and how to frame it (acknowledge, never dodge)

| Weakness | Frame it as | The honest next step |
| --- | --- | --- |
| ~91% of rainfall is synthetic; water level & flood label are derived | "We did not fake observations; we built a calibrated generator and labelled it everywhere" | Retrain on real LGU/PAGASA telemetry when accessible; treat current metrics as generator recovery |
| Test has 46 positives; AUPRC 0.71 | "Powered for a feasibility answer, not an operational claim" | More years/events; leave-one-event-out evaluation (already flagged) |
| ML tests red (5/33) since retrain | "Artifact and contract tests drifted; we know, and we flagged the exact mismatch (threshold 0.3439 → 0.4)" | Pin the artifact hash / update expectations; one PR |
| Lint red (4 errors) | "Known, enumerated, trivial" | 30 minutes, with CI to prevent recurrence |
| Build needs Firebase env; no `/_not-found` fallback | "Local-first posture; lazy-init refactor documented" | `lib/firebase.ts` lazy init; add `not-found.tsx` |
| No auth on Convex/API paths (P0 set) | "We audited our own auth in depth and published the findings before anyone asked" | Week-1 fix list exists in the audit; do not demo on a public network today |
| Requirements drift: roles (3 vs 4), research path, dataset sizes | "Documentation drift we caught ourselves during audit" | Single source of truth + doc owner |
| One squashed commit; 9.3 MB base zip tracked | "Imported history lost; here is the audit instead" | Purge artifacts; normal PR flow from tomorrow |
| Resident city is hard-coded "Marikina" | "Signup saves the city, UI doesn't read it — found by audit, fix sketched, not merged" | Use `locationCodeForName(roleProfile.city)` + `updateCurrentProfile` |
| `latestOutlook` returns null for mixed-city runs | "Classic newest-then-filter bug; fix identified in audit" | Select newest run *with a forecast row for this location* |

The winning move with a panel: **every weakness already appears, with severity and fix, in your
own audit documents.** State that in the first two minutes: *"We audited ourselves the day before
this defense. Here is what we found and what we fixed in methodology, and what we deliberately
did not rush."* Panels reward self-awareness far more than a flawless facade.

---

## 3. Recommended defense flow (~12–15 min + Q&A)

**0:00 — The honest framing (1 min).** "RiverGuard is an NCR flood-risk decision-support
*prototype*, built solo/small-team in three weeks, local-first by policy. It is not an early
warning system. Tonight: what it does, how it's built, where it's wrong, and what we'd do next."

**1:00 — The problem and why NCR (1 min).** Monsoon/typhoon flooding (Ondoy, Habagat, Ulysses,
Carina timeline); Marikina alarm doctrine; decision latency between rain gauge and LGU advisory;
existing portals are bulletin-style, not explainable. Position: *explainable local decision
support*, not prediction theatre.

**2:00 — The data card (2 min).** Open `data/README.md` / the workbook quality tab. Walk the
provenance split: synthetic-calibrated → ERA5 anchor (Ulysses) → ERA5 reanalysis from
2025-11-15. 15,884 rows, 3,971 days, 4 cities, 2.06% prevalence, chronological splits
(11,688 / 1,464 / 2,732). Say the magic sentence: *"91% of this is synthetic and labelled as
such; the label travels with every row via `RainSource`."*

**4:00 — The method (2 min).** Target definition (t+1 occurrence + water level), features,
chronological split, threshold tuning on validation (0.4), and why we report PR-AUC/Brier/
calibration and not accuracy. Show `docs/ml-methodology.md` and the warning embedded in
`model.json`. Mention baselines (antecedent-7-day rule: precision 0.25 / recall 0.70 — beating a
naive rule only 3× on precision is why claims stay modest).

**6:00 — Architecture (1 min).** One diagram: browser → Next.js (App Router) → Convex
(application data) + local FastAPI/ML artifacts (inference) + Open-Meteo (weather). Local-only by
policy; no public deployment; Firebase = auth only. OSM tiles via OSM with attribution.

**7:00 — Live demo (4–5 min).** Demo from the presentation machine with the dummy Firebase env
(see §0). Script:
1. Landing page → point at provenance footer and the "experimental decision support" framing.
2. Sign in → resident workspace → the forecast card / Marikina view (be upfront: city display is
   hard-coded today — it was found in audit; don't let a panelist find it first).
3. Researcher workspace → model explanation / feature contributions / alarm bands.
4. Map → GIS layers + attribution; toggle the Ulysses-era view if possible.
5. `/design-system` → design language and consistency effort.
6. If anything throws on stage: switch to pre-recorded screen capture immediately — rehearse the
   switch. Never debug live.

**12:00 — Known limitations, recited deliberately (1–2 min).** Read §2's table aloud, fast,
with the fixes queued. Panels trust teams that say their own failures before being asked.

**14:00 — Roadmap (1 min).** What Week-1 fixes buy (auth hardening, CI, build hygiene); what
real data would buy (LGU/PAGASA telemetry access, tide gauges, dam operation signals); what a
validation study would buy (against NDRRMC/LGU records, leave-one-event-out). End with: *"This is
a working local prototype with an honest dataset, an honest model, and an honest audit of our own
gaps — and the audit is the deliverable we're proudest of."*

---

## 4. Likely panel questions — and answers that hold up

- **"Is this an official warning?"** No. PAGASA and the LGU/DRRMO are the authorities; RiverGuard
  is decision support and shows that on every screen.
- **"How do you know it works?"** Chronologically evaluated, threshold locked on validation,
  Brier + calibration + PR-AUC reported; we don't claim operational skill — the labels are
  derived, and the docs say so in three places.
- **"Why synthetic data?"** Gauge telemetry for 4 cities over 10 years isn't publicly available;
  we built a calibrated generator anchored to PAGASA normals and ERA5, and we label it. That is
  more honest than scraping unknown-quality sources.
- **"What happens on a real typhoon day?"** It ingests Open-Meteo forecasts and produces an
  outlook + explanation; it cannot see tide gauges, dam releases, or street-level flooding —
  hence advisory-side positioning.
- **"Why one commit / no tests / no CI?"** Imported base lost history; we then audited
  ourselves comprehensively (two reports dated today). Test suite exists for the ML service
  (28/33 passing; the 5 failures are artifact drift, enumerated). CI is item #35 in the audit,
  queued.
- **"Can residents switch cities?"** Signup saves the city; the UI doesn't read it yet — audit
  finding, fix sketched, will be in the next PR. (Or, if you say so: residents use the four-city
  data; the demo path is Marikina.)
- **"What did you learn?"** Methodical honesty beats polished claims: deterministic data, provenance
  labels, chronological evaluation, self-audit, license ledger, GIS verification gates.

---

## 5. Night-before checklist

1. Presentation machine: `npm ci`, then `npm run build` with dummy Firebase env — confirm green.
2. Launch demo with **`NEXT_PUBLIC_DEV_BYPASS_AUTH=true` + dummy Firebase env vars set** (no Convex needed; bypass is dev-only): verified HTTP 200 on `/`,
   `/design-system`, `/resident`, `/lgu`, `/admin`, `/researcher`.
3. Verify no `.env.local` with real secrets walks onto the projector screen; screen-share at
   125–150% zoom; dark room lighting.
4. Re-upload the course notebook (it vanished from the workspace) or rebuild it; confirm the
   Colab link opens in an incognito window **before** the defense.
5. Export a 3–4 minute screen recording of the full demo path as fallback.
6. Print one page: this document's §0 matrix + §2 table. If asked "what's broken?", hand them the
   page.
7. Do not attempt the auth/city fixes tonight. Scripted, tested fixes tomorrow morning only if
   the panel asks — and then only with rehearsed, reversible diffs.
8. Rehearse once start-to-finish with a timer; keep the limitation-recitation to 90 seconds.

---

*Verification commands run 2026-11-20: `npm ci`; `npm run typecheck`; `npm run lint`;
`npm run build` (dummy Firebase env); `npm run dev` (with and without Firebase env); `pytest
services/ml` (5 failed / 28 passed); route HTTP checks against dev server; static review of repo
inventory (`git ls-files`, 533 files / 288 source). The demo server used for the HTTP checks is
still running on port 3000 with dummy Firebase env, Convex absent (degraded mode is intentional).*
