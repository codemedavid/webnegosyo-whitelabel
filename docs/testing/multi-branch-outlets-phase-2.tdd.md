# TDD evidence — Multi-branch outlets, Phase 2 (admin CRUD)

**Branch**: `feat/platform-supabase-order-parity`
**Checkpoints**: `fb65e65` (RED) → `86357bb` (GREEN)
**Predecessor**: [Phase 1 foundations](./multi-branch-outlets-phase-1.tdd.md)

Phase 1 built the data layer with no caller. Phase 2 gives it one: a merchant
can now create, edit, reorder, and hide branches — behind the same flag, on a
route that does not exist when the flag is off.

## Source plan

Derived from the multi-branch spec supplied with `/ecc:plan`, section **Admin
side**: *"Tenant admins need to be able to create, edit, reorder,
activate/deactivate outlets, and set the promo banner."*

Two spec items are **deliberately not in this phase**, and neither is
abandoned:

- **Promo banner.** It is a splash-screen field, and the splash screen is
  Phase 3. Shipping the editor a phase early would mean a settings control
  whose effect is invisible — the exact failure mode the inventory Overview
  work in this repo existed to fix. It moves to Phase 3 with the surface it
  configures.
- **Per-branch operating hours.** The column exists and is preserved on save
  (see test #24), but there is no editor yet. Branch hours only become
  legible once the storefront shows open/closed per branch, also Phase 3.

## User journeys

1. As a **superadmin**, I want to switch Branches on for one merchant, so a
   multi-outlet client gets the feature without any other tenant changing.
2. As a **merchant with several outlets**, I want to add each branch with its
   address and coordinates, so customers can be matched to the nearest one.
3. As a **merchant**, I want the branch link (slug) suggested from the name and
   shown to me before I save, so I know what my QR code will point at.
4. As a **merchant**, I want to be told immediately when a slug is unusable,
   rather than after saving.
5. As a **merchant**, I want to reorder branches, so the list customers see
   leads with my flagship.
6. As a **merchant closing a branch for the season**, I want to hide it without
   deleting it, so its settings and order history survive.
7. As a **restricted staff member without Store Setup**, I should not see the
   Branches section at all.
8. As **every existing tenant**, I want my admin to be byte-for-byte what it
   was yesterday.

## Task report

### Task 1 — Branch admin is reachable only through Store Setup permission

Added `outlets: 'store_setup'` to `ADMIN_SECTION_PERMISSIONS`. Branches are
store configuration, so they ride the existing permission rather than adding a
sixth key that every merchant would have to re-grant.

```
RED   ● permissionForAdminPath › maps branches to store setup
      Expected: "store_setup"
      Received: null
GREEN PASS tests/unit/staff-permissions.test.ts
```

**Guarantees**: a staff member without `store_setup` gets no Branches sidebar
entry (`filterSidebarEntriesByPermission` already consumes this map, and its
existing tests cover the filtering itself).

### Task 2 — The Branches entry appears only when the flag is on

The sidebar decided visibility inline inside `useFilteredItems`, reachable only
by rendering the component. Extracted verbatim to
`src/lib/admin-sidebar-visibility.ts` and added one rule for `/outlets`.

```
RED   Cannot find module '../../src/lib/admin-sidebar-visibility'
GREEN PASS tests/unit/admin-sidebar-visibility.test.ts (18 tests)
```

The extraction also removed a six-positional-boolean parameter list in favour
of one flags object; `SidebarProps` now extends `AdminSidebarFlags`, so adding
a future flag touches one type.

**Guarantees**: the regression block pins the exact hidden-path set for each
existing flag combination, including the two that are easy to break —
`enableOrderManagement` hiding orders only on a strict `false`, and Product
Analytics staying visible without menu engineering when Convex is configured.

### Task 3 — Typing in the form cannot produce a wrong branch

`src/lib/outlets/outlet-form.ts` maps the string-valued draft to a validated
`OutletWriteInput`, reusing the Phase 1 validation so the form can never report
a problem the server would accept, or vice versa.

```
RED   Cannot find module '../../src/lib/outlets/outlet-form'
GREEN PASS tests/unit/outlets-admin-form.test.ts (44 tests)
```

**One deliberate divergence from the house pattern.** The inventory form
helpers coerce a blank numeric field to `0` (`numberOrZero`). Copying that here
would be a live bug: `0` is a valid latitude, so nothing downstream would
reject it, and a merchant who left the coordinates blank would get a branch
ranked from the Gulf of Guinea — a wrong nearest-branch result that reads as
the feature being broken. Blank means `null` here, and a non-numeric entry is
an error rather than a silent default (tests #12–#14).

### Task 4 — Reordering, and the surfaces

`moveOutletOrder` is pure and tested; the manager, form, server actions, and
page are thin shells over it and the Phase 1 repository. The page calls
`notFound()` when the flag is off, so the route does not exist for a flag-off
tenant and runs no query.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `/admin/outlets` requires the Store Setup permission | `staff-permissions.test.ts:maps branches to store setup` | unit | PASS |
| 2 | A tenant with no flags set hides exactly today's sections plus Branches | `admin-sidebar-visibility.test.ts:hides the opt-in sections…` | unit | PASS |
| 3 | Orders hides only on a strict `false`, never on undefined | `…:hides orders only when order management is explicitly switched off` | unit | PASS |
| 4 | Product Analytics survives without menu engineering when Convex is on | `…:keeps product analytics visible…` | unit | PASS |
| 5 | Branches is hidden when the flag is absent, false, or null | `…:hides Branches when…` ×3 | unit | PASS |
| 6 | Branches appears once the flag is true | `…:shows Branches once multi-branch is on` | unit | PASS |
| 7 | The `/outlets` rule does not swallow `/orders` or `/order-types` | `…:does not let the Branches rule swallow the Orders entry` | unit | PASS |
| 8 | A new branch starts active and supporting both fulfillment modes | `outlets-admin-form.test.ts:EMPTY_OUTLET_DRAFT` ×3 | unit | PASS |
| 9 | The slug is derived from the name until the merchant types one | `…:derives a slug from the name…` | unit | PASS |
| 10 | A typed slug is normalized the same way a derived one is | `…:normalizes a typed slug…` | unit | PASS |
| 11 | A blank name is rejected | `…:rejects a blank name` | unit | PASS |
| 12 | A blank coordinate becomes null, never zero | `…:treats blank coordinates as absent, never as zero` | unit | PASS |
| 13 | A non-numeric coordinate is an error, not a default | `…:rejects a coordinate that is not a number…` | unit | PASS |
| 14 | A non-numeric delivery radius is an error | `…:rejects a delivery radius that is not a number` | unit | PASS |
| 15 | Half a coordinate pair is rejected | `…:rejects half a coordinate pair` | unit | PASS |
| 16 | An out-of-range coordinate is rejected | `…:rejects an out-of-range coordinate` | unit | PASS |
| 17 | A negative delivery radius is rejected | `…:rejects a negative delivery radius` | unit | PASS |
| 18 | A reserved slug is rejected before it can reach the router | `…:rejects a reserved slug…` | unit | PASS |
| 19 | A branch supporting neither pickup nor delivery is rejected | `…:rejects a branch that supports neither…` | unit | PASS |
| 20 | Blank text fields become null, not empty strings | `…:turns a blank address/phone/timezone into null` ×3 | unit | PASS |
| 21 | The draft handed in is never mutated | `…:does not mutate the draft it was handed` | unit | PASS |
| 22 | A stored branch round-trips through the form unchanged | `…:round-trips a stored outlet…` | unit | PASS |
| 23 | Absent optional fields render as blank inputs, not "null" | `…:renders absent optional fields as blank inputs…` | unit | PASS |
| 24 | Operating hours survive a save despite having no editor | `…:preserves operating hours it has no editor for yet` | unit | PASS |
| 25 | Reordering moves one position and is a no-op at both ends | `…:moveOutletOrder` ×7 | unit | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom="src/lib/outlets/**/*.ts" \
  --collectCoverageFrom="src/lib/admin-sidebar-visibility.ts" \
  --testPathPatterns="(outlets-|admin-sidebar-visibility)"

File                             | % Stmts | % Branch | % Funcs | % Lines
---------------------------------|---------|----------|---------|--------
All files                        |   84.64 |    98.97 |   97.61 |   84.64
 admin-sidebar-visibility.ts     |     100 |      100 |     100 |     100
 lib/outlets                     |   83.92 |    98.91 |    97.5 |   83.92
  in-memory-outlet-repository.ts |     100 |      100 |     100 |     100
  multi-branch-flag.ts           |     100 |      100 |     100 |     100
  nearest-outlet.ts              |     100 |      100 |     100 |     100
  outlet-form.ts                 |     100 |      100 |     100 |     100
  outlet-repository.ts           |     100 |    97.82 |     100 |     100
  reserved-slugs.ts              |     100 |      100 |     100 |     100
  supabase-outlet-repository.ts  |       0 |        0 |       0 |       0

Tests: 190 passed (6 suites)
```

Every module with logic is at 100%. `supabase-outlet-repository.ts` is the only
thing holding the directory under 85%, unchanged from Phase 1: it needs a live
database, and all of its logic lives in the 100%-covered shared module — it is a
thin PostgREST translation.

## Regression proof

Full suite: `Test Suites: 1 skipped, 250 passed`, `Tests: 8 skipped, 3024
passed, 3032 total` — up from 2971 in Phase 1, with no previously-passing test
changed or removed.

Types: `npx tsc --noEmit` reports **0 errors under `src/`**. The 24 remaining
errors are all in test files and are the same pre-existing set measured in
Phase 1 (they stem from `src/types/supabase.ts` being hand-edited while the
migration is unapplied).

Lint: clean on all nine changed/added files.

For a tenant with `multi_branch_enabled` false:

| Surface | Behaviour |
|---|---|
| Sidebar | `/outlets` in the hidden set → the entry is not rendered (test #5) |
| `/admin/outlets` | `notFound()` before any query runs |
| Every other admin route | Untouched — the only shared-file edits are the sidebar extraction (regression-locked, tests #2–#4) and one added `Store Setup` child that the same flag hides |
| Database | No new query. The page is the only caller of the outlet repository |

## Known gaps

1. **The migration is still unapplied.** No environment has the `outlets`
   table, so the Branches page will error against a live database until
   `20260730120000_multi_branch_outlets.sql` runs. Regenerate
   `src/types/supabase.ts` afterwards and reconcile against the hand-written
   block.
2. **`supabase-outlet-repository.ts` remains untested** (see Coverage).
3. **No component-level test** for `outlets-manager.tsx` / `outlet-form.tsx`.
   All decision logic was pushed into the two pure modules above, which are at
   100%; the components are wiring. The manual QA checklist covers them.
4. **Promo banner and per-branch hours editors** are deferred to Phase 3 with
   the surfaces they configure (see Source plan).

## Manual QA checklist

Requires the migration applied.

**Flag off (regression — run this first, on a real existing tenant)**
- [ ] The admin sidebar is identical to before: no Branches entry under Store Setup.
- [ ] `/{tenant}/admin/outlets` returns 404.
- [ ] The storefront menu, cart, and checkout are unchanged.

**Flag on**
- [ ] Superadmin → tenant → **Branches** → Enable → save; reload confirms it stuck.
- [ ] Branches appears under Store Setup; the empty state explains that nothing changes for customers until there are two active branches.
- [ ] Add a branch: type only a name → the slug preview fills in from it.
- [ ] Type `checkout` as the slug → rejected with a "reserved" message, no save.
- [ ] Type `north` in Latitude → rejected as not a number.
- [ ] Fill Latitude but leave Longitude blank → rejected as a pair.
- [ ] Leave both blank → saves, and the row warns that the branch cannot be matched to a location.
- [ ] Turn off both Pickup and Delivery → rejected.
- [ ] Add a second branch with the same slug → rejected as already in use.
- [ ] Reorder with the arrows → order persists across a reload; arrows are disabled at the ends.
- [ ] Hide a branch → it dims and shows a Hidden badge; Show restores it.
- [ ] Edit a branch, change only the name → address, coordinates, and radius are unchanged afterwards.

**Permissions**
- [ ] A staff member without Store Setup sees no Branches entry, and `/admin/outlets` is unreachable for them.
- [ ] A tenant admin cannot read or write another tenant's branches (RLS).

## Merge evidence

- **RED** `fb65e65` — `tests/unit/outlets-admin-form.test.ts` and
  `tests/unit/admin-sidebar-visibility.test.ts` failed to resolve their modules
  (compile-time RED); `staff-permissions.test.ts` failed at runtime with
  `permissionForAdminPath('/my-resto/admin/outlets')` returning `null`.
  Result: `Test Suites: 3 failed, Tests: 1 failed, 30 passed`.
- **GREEN** `86357bb` — same three targets rerun: `Test Suites: 3 passed,
  Tests: 83 passed`. Full suite `3024 passed`.
- **Refactor** — folded into the GREEN commit: the sidebar filtering extraction
  is itself the refactor, and it is covered by the regression block rather than
  by a separate checkpoint.

**Concurrent-session note.** As in Phase 1, another Claude Code session has
been committing to this working tree. Both checkpoints above are reachable from
`HEAD` on `feat/platform-supabase-order-parity`, and only the listed paths were
staged (never `git add -A`).
