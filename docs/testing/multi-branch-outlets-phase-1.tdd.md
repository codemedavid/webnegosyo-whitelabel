# TDD evidence — Multi-branch outlets, Phase 1 (foundations)

**Source plan**: none on disk. Journeys were derived during the Phase 0
exploration in this session and approved by the user with "confirm and you may
proceed", including four explicit rulings recorded under *Decisions* below.

**Scope of this phase**: data model, feature flag, and the repository seam.
There is **no user-visible change**. Phases 2–6 (admin CRUD, storefront
selection, deep links, order write-through, edge cases) are not started.

---

## Decisions this phase encodes

The spec asked for a Convex-primary / Supabase-fallback adapter. That was
challenged during Phase 0 and the user confirmed the alternative:

| # | Decision | Why |
|---|---|---|
| A | Outlets live in **platform Supabase**, behind an `OutletRepository` interface | Convex here holds orders/analytics only, per tenant, reachable solely through a manual schema-deploy pipeline (`CURRENT_SCHEMA_VERSION`). Catalog/config has always lived in platform Supabase. Tenants on the `platform` and `supabase` order backends have no Convex at all. |
| B | Deep links ship as `?outlet=` plus `/b/{slug}` — **no bare root slugs** | A root-level `[outlet]` segment converts every currently-404ing tenant path into an outlet lookup. `b` is reserved from the start. |
| E | Outlet read failures **fail loudly** | Degrading to "no branches" renders the single-outlet flow for a multi-branch merchant and sends the order to the wrong kitchen. |
| F | Per-outlet delivery **pricing deferred** | Fee origin stays on the tenant. `delivery_radius_km` on an outlet is used for branch *matching* only this phase, so no existing tenant's prices move. |

---

## User journeys

1. As an existing merchant who has never heard of this feature, I want my
   storefront to behave exactly as it does today, so that nothing I rely on
   changes. *(Guaranteed by the flag defaulting to off for missing/null.)*
2. As a merchant switched on mid-setup with zero or one branch, I want my
   storefront to keep working, so that being flagged early does not break me.
3. As a merchant, I want a branch link that collides with a real page to be
   refused when I type it, so that I never print a QR code that shadows my menu.
4. As a customer who denies location access, I want a complete, ordered list of
   branches anyway, so that I can still order.
5. As a customer allowing location, I want the nearest branch pre-selected — and
   for delivery, the nearest one that actually reaches me — while staying free to
   choose another.
6. As a merchant, I want deactivating a branch to hide it from customers without
   destroying its order history.

---

## Task report

### Task 1 — Feature flag that defaults off

Added `src/lib/outlets/multi-branch-flag.ts` with `isMultiBranchEnabled` and
`shouldPromptOutletSelection`. No coercion: only a literal `true` enables the
feature, and a tenant with fewer than two active outlets never prompts.

- **Command**: `npx jest tests/unit/outlets-multi-branch-flag.test.ts`
- **RED**: `Cannot find module '../../src/lib/outlets/multi-branch-flag'`
- **GREEN**: `Tests: 13 passed`
- **Guarantees**: missing, null, undefined, `false`, a non-boolean `"true"`, and
  a null tenant all read as off; zero/one active outlet never prompts even with
  the flag on.

### Task 2 — Reserved-slug validation from the real route table

Added `src/lib/outlets/reserved-slugs.ts`. The reserved set is enumerated from
`src/app/[tenant]/*`, the platform-root segments a subdomain rewrite reaches,
and the reserved subdomains in `src/lib/tenant.ts`.

- **Command**: `npx jest tests/unit/outlets-slug.test.ts`
- **RED**: module not found.
- **First GREEN run surfaced a real defect**: `b` was rejected as "at least 2
  characters" instead of "reserved", so a merchant would lengthen it and hit a
  second, unrelated-looking error. The reserved check now runs before the shape
  checks.
- **GREEN**: `Tests: 36 passed`
- **Guarantees**: every route segment listed in the test is rejected as
  *reserved*; malformed slugs (spaces, `/`, `.`, `_`, leading/trailing/doubled
  hyphens, non-ASCII) are rejected; casing and padding are normalized; a slug
  that merely *contains* a reserved word (`menu-park`) is allowed;
  `slugifyOutletName` always produces something `validateOutletSlug` accepts.

### Task 3 — Nearest-branch ranking

Added `src/lib/outlets/nearest-outlet.ts`, reusing `haversineDistanceKm` from
`src/lib/delivery-fee.ts` rather than reimplementing it.

- **Command**: `npx jest tests/unit/outlets-nearest.test.ts`
- **RED**: module not found.
- **First GREEN run surfaced a second real defect**: pickup mode evaluated the
  delivery radius, so a branch you can walk into was reported "out of range".
  Coverage is now resolved per mode.
- **GREEN**: `Tests: 37 passed`
- **Guarantees**: no origin, a null origin, and out-of-range/NaN coordinates all
  fall back to `sort_order` with null distances and no preselection; a single
  eligible outlet is always preselected; pickup preselects the nearest; delivery
  preselects the nearest outlet that *covers* the customer and preselects
  nothing when none do, while still listing them all; a blank/zero/negative
  radius means unrestricted; the radius boundary is inclusive; unlocatable
  outlets sink below located ones; ties break by `sort_order` then id; the
  caller's array is never mutated or reordered.

### Task 4 — Repository seam

Added `outlet-repository.ts` (interface, shared validation, `OUTLET_SELECT`),
`in-memory-outlet-repository.ts`, and `supabase-outlet-repository.ts`. The
contract suite is exported as a factory so a second implementation is a drop-in.

- **Command**: `npx jest tests/unit/outlets-repository-contract.test.ts`
- **RED**: module not found.
- **GREEN**: `Tests: 52 passed` (later 58 after coverage hardening)
- **Guarantees**: tenant isolation on every read and write (`listByTenant`,
  `findBySlug`, `findById`, `update`, `reorder` all refuse to cross tenants);
  ordering by `sort_order` then name; slug uniqueness per tenant including
  case-only differences, with the same slug allowed under a different tenant;
  reserved and malformed slugs rejected at the repository boundary; blank names,
  neither-pickup-nor-delivery, out-of-range coordinates, half a coordinate pair,
  and negative radii all rejected — including when a *patch* produces them after
  merging; deactivation preserves the row; `reorder` ignores foreign ids.
- The `OUTLET_SELECT` projection test asserts the column list matches the
  `Outlet` type exactly. This is the guard against the failure mode that has
  bitten this codebase twice: a column the app reads but the query never selects
  resolves to `undefined` at runtime.

### Task 5 — Additive migration

`supabase/migrations/20260730120000_multi_branch_outlets.sql`: one flag column
(`NOT NULL DEFAULT false`), the `outlets` table with CHECK constraints mirroring
the application validation, `orders.outlet_id` (nullable, no default, no
backfill, `ON DELETE SET NULL`), a partial index on the non-null rows, and RLS
policies copied from the corrected shape in
`20260726140000_fix_tenant_isolation_rls.sql` (comparing `au.tenant_id` to the
**row's** `tenant_id`).

**Not applied.** See *Known gaps*.

---

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | A tenant row without the column behaves as flag-off | `outlets-multi-branch-flag.test.ts` | unit | PASS |
| 2 | A non-boolean flag value does not enable the feature | `outlets-multi-branch-flag.test.ts` | unit | PASS |
| 3 | Flag on with 0 or 1 active outlet never prompts for selection | `outlets-multi-branch-flag.test.ts` | unit | PASS |
| 4 | Every existing route segment is rejected as a reserved slug | `outlets-slug.test.ts` | unit | PASS |
| 5 | Malformed slugs cannot be stored | `outlets-slug.test.ts` | unit | PASS |
| 6 | Denied/absent/invalid geolocation still yields a full ordered list | `outlets-nearest.test.ts` | unit | PASS |
| 7 | Pickup preselects the nearest; delivery preselects the nearest that covers | `outlets-nearest.test.ts` | unit | PASS |
| 8 | No covering outlet ⇒ no preselection, all outlets still listed | `outlets-nearest.test.ts` | unit | PASS |
| 9 | Exactly one eligible outlet is always preselected | `outlets-nearest.test.ts` | unit | PASS |
| 10 | Distance ties resolve deterministically | `outlets-nearest.test.ts` | unit | PASS |
| 11 | No repository operation crosses a tenant boundary | `outlets-repository-contract.test.ts` | unit | PASS |
| 12 | Slugs are unique per tenant, case-insensitively | `outlets-repository-contract.test.ts` | unit | PASS |
| 13 | A patch cannot merge into an invalid row | `outlets-repository-contract.test.ts` | unit | PASS |
| 14 | Deactivation preserves the row and its link | `outlets-repository-contract.test.ts` | unit | PASS |
| 15 | `OUTLET_SELECT` matches the `Outlet` type exactly | `outlets-repository-contract.test.ts` | unit | PASS |

---

## Regression proof (flag off)

- `npx jest` → `248 passed, 1 skipped; 2965 tests passed, 0 failures`. No
  pre-existing test changed behaviour.
- `npx tsc --noEmit` → **0 errors under `src/`**. The 24 remaining errors are all
  in pre-existing test files. Verified as pre-existing by running `tsc` against
  `git show HEAD:src/types/supabase.ts` and the modified copy: **24 before, 24
  after**.
- `npx eslint src/lib/outlets tests/unit/outlets-*.test.ts` → clean.
- No existing file's runtime behaviour was modified. The only edits outside the
  new `src/lib/outlets/` directory are **additive type declarations**
  (`src/types/database.ts`, `src/types/supabase.ts`) and one new migration file.
  No existing query, component, route, or middleware path was touched, so a
  flag-off tenant executes byte-for-byte the same code as before.

---

## Coverage

```
npx jest tests/unit/outlets-*.test.ts --coverage --collectCoverageFrom='src/lib/outlets/**/*.ts'

File                            | % Stmts | % Branch | % Funcs | % Lines
All files                       |    80.8 |     98.7 |   96.87 |    80.8
 in-memory-outlet-repository.ts |     100 |      100 |     100 |     100
 multi-branch-flag.ts           |     100 |      100 |     100 |     100
 nearest-outlet.ts              |     100 |      100 |     100 |     100
 outlet-repository.ts           |     100 |    97.56 |     100 |     100
 reserved-slugs.ts              |     100 |      100 |     100 |     100
 supabase-outlet-repository.ts  |       0 |        0 |       0 |       0
```

138 tests. Threshold met (80.8%).

## Known gaps

1. **`supabase-outlet-repository.ts` is at 0%.** It needs a live database. All
   of its logic — validation, normalization, invariants — lives in
   `outlet-repository.ts` at 100%; the adapter is a thin PostgREST translation.
   It is unexercised until the migration is applied and Phase 2 gives it a
   caller. Manual QA below is the current cover.
2. **The migration is not applied.** No environment has the `outlets` table yet.
   The Supabase types were hand-written to match the migration; regenerate them
   with `mcp__supabase__generate_typescript_types` after applying, and reconcile.
3. **Adapter parity is asserted against one implementation.** The contract suite
   is a factory precisely so a second backend can be added to it; today only the
   in-memory repository runs through it.
4. **Not started**: admin CRUD, storefront selection, deep links, order
   write-through, analytics context, and the cart/deactivation edge cases.

## Manual QA checklist

Nothing customer-facing exists yet, so this phase's QA is a non-regression pass:

- [ ] Apply `20260730120000_multi_branch_outlets.sql` to staging; confirm it
      succeeds and that `tenants.multi_branch_enabled` is `false` for every row.
- [ ] Load a storefront menu, add to cart, and complete checkout on a tenant on
      each order backend (`platform`, `convex`, tenant `supabase`). Confirm
      unchanged behaviour and that new orders write `outlet_id = NULL`.
- [ ] Confirm the admin orders queue and the merchant app still render orders.
- [ ] `INSERT` an outlet by hand with slug `menu`; confirm the DB CHECK/app
      validation refuses the collision path you exercise.
- [ ] Regenerate Supabase types and confirm no diff against the hand-written
      block.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`:

- `e3f7338` — `test: add reproducers for multi-branch outlet foundations` (RED:
  4 suites fail on unresolved modules)
- `f99da5c` — `feat: multi-branch outlet foundations behind a per-tenant flag`
  (GREEN: 132 passing, 2965 total, 0 regressions)

Note: another Claude Code session working in the same tree interleaved three
unrelated commits (`ac0301a`, `a3a978b`, `5e05452`, merchant-app inventory work)
between the RED and GREEN checkpoints. Both checkpoints are ancestors of `HEAD`
on this branch and touch disjoint files. If these commits are squashed, preserve
this file.
