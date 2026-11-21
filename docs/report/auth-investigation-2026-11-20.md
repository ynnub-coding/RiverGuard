# Authentication and role-assignment investigation — 2026-11-20

**Question set:** (1) is the login/registration/Google flow correct? (2) why does
“Continue with Google” on the login form land a brand-new user on Resident pages?
(3) how can an existing Resident request/upgrade to Researcher or LGU? (4) what
breaks if the onboarding process is removed?

**Method:** static trace of `PublicScreens.tsx` (auth screens), `EnsureCurrent.tsx`,
`FirebaseAuthProvider.tsx`, `WorkspaceGate.tsx`, `convex/users.ts`, `convex/lgu.ts`,
`docs/AUTH_ROUTING.md`, `docs/architecture/role-consolidation.md`. No live sign-in
was attempted (no Firebase project configured in this checkout); behavior below is
read directly from the code paths.

---

## 1. Answer to (2): why Google-on-login lands new users on /resident

`LoginFormBody.finishSignIn` (apps/web/src/components/prototype/PublicScreens.tsx)
runs for **both** the email and the Google button, and it calls
`ensureCurrent?.({})`.

`convex/users.ts ensureCurrent` then:

1. Looks up `users` by `externalId = identity.subject` — nothing found for a new Google identity.
2. **Inserts a brand-new `users` row** with `role: args.requestedRole ?? "resident"` →
   `"resident"`, and `status: "active"` (because `requestedRole` was undefined — only
   `lgu`/`researcher` get `pending`).
3. Returns `{ role: "resident", status: "active" }`.

`finishSignIn` routes to `/resident`, and `WorkspaceGate` admits an active resident.
So: no role selection, no profile, no consent checkboxes, no onboarding — a full
account is minted by a *login* button. The signup screen's Google button is
implemented differently (it passes `requestedRole`), which is why the same Google
credential produces two different products depending on which screen you pressed it
on. The user is right: this is not correct behaviour. The gate is doing “Google
sign-in ⇒ active resident” as a side effect of the *login* screen.

Compounding defects in the same file:

- `ensureCurrent` returns `status: "active"` hard-coded for newly inserted accounts,
  even when the row was actually inserted as `pending` (lgu/researcher). Any caller
  that trusts `account.status` is misled.
- `ensureCurrent` accepts `requestedRole` from the client with **no server-side
  allow-list** — `admin` self-assignment is possible from any client that calls the
  mutation directly (signup UI only *offers* resident/lgu/researcher, that is not
  enforcement).
- The unverified-email branch of the email login path calls
  `ensureCurrent({ requestedRole: "resident" })`. If the Convex row was deleted (the
  reset procedure in docs/AUTH_ROUTING.md §7), an LGU/researcher-recovery login
  recreates the account as **resident/active**.
- Email verification is checked for password accounts (routes to `/auth/verify`)
  but the Google path never checks anything — fine for Google (addresses are
  verified), but the path asymmetry means “is this account supposed to exist?” is
  never evaluated anywhere.
- `/auth/verify?source=access|invitation` shows a six-digit code input where the
  Verify button sets `verified = true` **regardless of the code (or with none)** —
  theatre, not verification.
- `/auth/pending` (“PendingApproval”) flips to the **“Access approved”** screen when
  the user presses “Refresh status”, without asking Convex anything. The user is then
  told to begin onboarding. `WorkspaceGate` still blocks them (status `pending`), so
  they bounce between “Access approved” and the gate wall.
- Returning pending users who log in see only `WorkspaceGate`’s “Your RiverGuard
  account is not active” denial — there is **no link back to `/auth/pending`**, so a
  pending LGU/researcher has no way to see their request status after closing the tab.
- Google signup (`ResidentSignup` Google button) routes `/onboarding/{role}` for
  **all** roles including pending LGU/researcher — bypassing `/auth/verify` and
  `/auth/pending` entirely (the email path does show them). Inconsistent flows.
- `WorkspaceGate` without Convex renders `FirebaseOnlyGate`: any signed-in Firebase
  user is admitted to every workspace including `/admin` (fail-open; see the
  overall scan, finding #12).

## 2. Answer to (1): is the auth flow “working”?

Partially, by accident:

| Flow | Actual behaviour | Verdict |
|---|---|---|
| Email login, verified, account exists | `ensureCurrent({})` → routes to stored role; `WorkspaceGate` enforces role/status | Works |
| Email login, unverified | → `/auth/verify?source=signup` (sends verification mail) | Works |
| Email signup → verify → workspace | Creates Firebase user + Convex row; resident active; lgu/researcher pending; verify link → `/auth/verify` → resident: `/onboarding/resident`, others: `/auth/pending` | Mostly works |
| Google signup | Same, but skips verify/pending **and** sends pending roles to onboarding → then gate-walled | Broken flow |
| **Google login, identity never seen** | **Auto-creates ACTIVE resident, routes `/resident`** | **Bug (reported)** |
| Google login, existing pending account | Routes `/lgu` (or role) → gate denial, no path back to `/auth/pending` | Dead-end UX |
| Password reset / MFA / invitation | Reset email is the only real path; MFA screen is an honest “unavailable”; invitation screen is an honest stub | Honest stubs |
| Account admin (invite/approve/assign) | **Nothing exists.** “Invite user” modal fakes it (`Invitation queued (not delivered — no backend)`); “Access requests” screen says not wired | Not implemented |
| Failure modes | Convex absent → fail-open FirebaseOnlyGate into all workspaces | Broken |

## 3. Answer to (3): requesting an additional / upgraded role — none exists

There is **no path, in UI or backend, for an existing user to request another role**
(e.g. Resident → Researcher). Concretely:

**Backend**
- `users.ensureCurrent` ignores `requestedRole` for existing accounts (patch
  touches only email/displayName/roleProfile). It can never change a role.
- `users.updateCurrentProfile` patches `displayName`/`roleProfile` only. It cannot
  (and should not) change role/status. Side effect: a pending user can keep editing
  `roleProfile` after an administrator is shown it for approval — the record the
  admin approved can differ from the one acted on.
- No `roleRequests` table, no request mutation, no approve/reject mutation, no
  assignment mutation for `lguProfiles.assignedLocationCodes`, no admin tooling in
  the Convex API surface at all (`convex/` has no admin module).

**Frontend**
- Settings → “Account access” section: one variant renders **disabled**
  (“Backend review required”); the other variant renders **enabled-looking**
  “Request review” / “Request deactivation” buttons with **no `onClick`** — dead UI.
- `/auth/request-access` (public): hard-coded `readOnly` "LGU operator", `router.push`
  to `/auth/verify?source=access`, **persists nothing**, and lands on the
  auto-passing fake code screen (§1). It is a form that discards its data.
- Docs (`docs/designs/ui-ux-design-cheat-sheet.md`) describe “Request Access Change”
  and “Switch Workspace — only for approved multi-role accounts” as design intent;
  neither exists. The admin “Access requests” queue is an empty-state stub.
- Multi-role switching: `data/prototype.ts roleCapabilities` only hides admin nav
  items; the schema (`users.role` single enum) cannot represent two roles at all.
- Assignment of LGU location scope (`lguProfiles.assignedLocationCodes`) is only
  read, never written, anywhere in the repo — so even a manual DB fix has no UI.

**So the only way any account gets a non-resident role today is** (a) signup with
that role selected (then, for lgu/researcher, status stays `pending` forever because
no approval tooling exists), or (b) someone hand-editing the Convex dashboard. There
is no audit trail either way.

## 4. Answer to (4): would removing Onboarding break anything?

**No — onboarding is pure choreography with no side effects.** It can be removed
safely *if the links into it are repointed*. Evidence:

- Nothing reads onboarding completion. `WorkspaceGate` does not check it; no Convex
  table/field records it; no `localStorage` key (only `riverguard:resident-preferences`
  exists, unrelated); all form state is uncontrolled local component state.
- Its “Go to workspace” button just `router.push`es to a predetermined destination
  (`onboardingContent[role].destination`); the gate makes the real decision.
- Routes into it: `PrototypeRouter` (`onboarding` branch), Google-signup
  `router.push(`/onboarding/${role}`)`, `VerificationBody` (resident →
  `/onboarding/resident`), `PendingApproval` (after the fake “Access approved”
  flip). Nothing in `RoleScreens`, `ResearcherScreens`, settings, or Convex
  references it.
- Docs referencing it: `docs/AUTH_ROUTING.md`, `docs/designs/frontend-route-inventory.md`,
  `docs/designs/ui-ux-design-cheat-sheet.md`, `docs/architecture/role-consolidation.md`
  (admin orientation), `docs/designs/ui-ux-design-cheat-sheet.md` §D.

Removal therefore only risks **dead links**, not broken auth — with one caveat: an
unknown `/onboarding/*` currently falls through `PrototypeRouter` to `<WelcomeScreen />`
with HTTP 200 instead of 404 (see overall scan #28). Repoint callers first, then
delete the branch and docs, and add `not-found` handling in the same change.

If the motive is “pending LGU/researcher users shouldn't walk through a
‘Ready to enter the workspace’ flow they cannot enter”, the cheaper fix is to skip
onboarding for accounts whose Convex status is `pending` (route them to
`/auth/pending`) — kept as a resident-only, post-verification step. Removing it
entirely also works; then fold its single meaningful element (the
experimental-use acknowledgement checkbox, already present at signup as
“Accept future terms …”) into signup and drop the `/onboarding/*` family. Either
way, auth correctness does not depend on the decision; it depends on fixing
ensureCurrent + the gate.

## 5. Consolidated problem list (auth-specific)

**P0**
1. `ensureCurrent` self-service privilege escalation (`requestedRole: "admin"`) — and hard-coded `status: "active"` return.
2. Login screen auto-provisions a brand-new Google/email identity as **active resident** (the reported bug). Login must not create accounts; missing profile should route to signup (or explicit “restore account” flow).
3. `WorkspaceGate` fail-open when Convex is absent (any signed-in user → every workspace incl. admin).

**P1**
4. Google signup bypasses `/auth/verify` and `/auth/pending`; email signup does not.
5. Pending-returning-user dead-end (gate denial, no link to `/auth/pending`); `ensureCurrent` mis-reports pending as active.
6. Fake verification (`source=access|invitation` codes auto-pass) and fake approval (`Refresh status` unconditionally “Access approved”).
7. No role-request or approval backend exists; dead “Request review” UI; LGU-only, non-persisting `/auth/request-access`; admin tooling absent; `lguProfiles` assignments unmanageable from the product.
8. `updateCurrentProfile` lets a pending user rewrite `roleProfile` after review is requested.

**P2**
9. Single-role schema (`users.role` enum) cannot express approved multi-role accounts; `roleCapabilities` is nav-decoration, not authorization.
10. Onboarding routes un-gated and misleading for pending roles (see §4).
11. Convex holds no email-verification enforcement (relies on Firebase UX; token claim `email_verified` unexamined).

## 6. Minimal coherent design (proposed, not implemented)

1. **Login never provisions.** `ensureCurrent` on the login path returns `null` for
   unknown identities → client signs out and redirects to `/auth/signup`. Provisioning
   happens only in signup (`requestedRole` allow-list: resident active; lgu/researcher pending; admin never via client) or in an explicit recovery path with admin review.
2. **`users` gains a `roleRequests` table** `{ requesterId, requestedRole, roleProfile, reason, status: pending|approved|rejected, reviewedBy, reviewedAt, reviewNotes }`;
   `requestRole`, admin `reviewRoleRequest`, `assignLguLocations` mutations; settings
   “Request an access change” wires to it; admin “Access requests” wires to the queue;
   collections feed off it; all behind `requireRole(["admin"])`.
3. **`WorkspaceGate` fail-closed** without Convex; pending accounts routed to
   `/auth/pending` (which reads live status via a Convex query, not a button flip).
4. **Honest screens**: `/auth/verify` code path removed or wired to real OTP;
   invitation flow either implemented or hidden; `Refresh status` = live query.
5. Onboarding: delete or gate to verified, active residents; update the four docs.
6. Convex enforces `email_verified` claim for password accounts and role/status on
   every sensitive query — defense in depth under the client UX.
