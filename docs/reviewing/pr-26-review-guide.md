# PR #26 — Reviewer's guide

Branch `feat/platform-supabase-order-parity` → `main`. 557 files, ~+69.7k lines, ~300 commits.

This PR is too large for file-by-file review, and CodeRabbit declined it automatically
(567 files against its 100-file limit). This guide exists so the PR can still be reviewed
with confidence: it says what is already mechanically verified, what a human still needs to
judge, and in what order to read.

## 1. What is already verified

| Check | Result |
|---|---|
| Vercel production build (pushed SHA) | **pass** |
| Web unit suite (`npm run test`) | **3,604 passed**, 8 skipped, 298 suites |
| Merchant app suite (`webnegosyo-app`) | **1,274 passed**, 81 suites |
| Supabase migrations | all 18 **applied** to the production project |
| TDD evidence | 50 reports under `docs/testing/*.tdd.md` |

Every behavioural change in this branch landed as a failing `test:` commit followed by the
`feat:`/`fix:` that made it pass. The `docs/testing/*.tdd.md` report for a slice names the
reproducer, the commit hashes, and any live verification — read the report before the
implementation and the diff gets much smaller.

### Known lint state

`npm run lint` reports 88 errors. None are introduced by this PR:

- **61** are in `webnegosyo-desktop/out/` — gitignored build output that is *not* part of this
  PR. The root `eslint.config.mjs` ignores `out/**`, which in flat config only matches the
  repo root, so the desktop app's build directory gets linted. Fixing this means changing
  `out/**` to `**/out/**` (blocked by the repo's config-protection hook — needs a human).
- **19** are `@typescript-eslint/no-explicit-any` in merchant-app *test* files plus one
  `require()` in `jest.config.cjs`. Pre-existing style debt in files this PR also touched.
- **8** are in files this PR does not touch at all.

Vercel's `next build` lints the Next app only and passes clean (4 warnings, 0 errors).

## 2. The four workstreams

The branch grew four features in parallel, which is why the diff is interleaved. Review them
as four separate features — they are largely separable by path.

### A. Platform Supabase order backend (Convex parity)

Lets a tenant run orders on the platform Supabase DB instead of its own Convex deployment.

- `src/lib/order-backend.ts` — resolves which backend a tenant uses (web side)
- `webnegosyo-app/lib/backends/route.ts` — routes each Convex function ref to Convex, the
  platform adapter, or neither
- `webnegosyo-app/lib/backends/supabase-adapter.ts`, `supabase-orders.ts`,
  `supabase-realtime.ts`, `order-revise.ts` — the adapter itself
- `supabase/migrations/*platform_order_parity*`, `*platform_order_convex_parity_columns*`
- Evidence: `docs/testing/platform-supabase-order-parity.tdd.md`,
  `order-backend-convex-drift.tdd.md`

**What a human must judge:** the tenant guard in `supabase-adapter.ts`. Every read and write
must be constrained to the calling tenant — this is the cross-tenant boundary.

### B. Multi-branch outlets

- `src/lib/outlets/` — branch scope, checkout selection, deep links, analytics, KPIs
- `webnegosyo-app/lib/branch-*.ts` — app-side scope, dashboard, verdict, KPIs
- Migrations: `multi_branch_outlets`, `outlet_dine_in_and_image`, `outlet_selection_timing`,
  `branch_scoped_staff`, `branch_scoped_order_reads`, `outlets_write_store_wide_only`
- Evidence: `multi-branch-outlets-phase-1..7`, `branch-scoped-*`, `branch-first-owner-view`,
  `branch-management-redesign`

**What a human must judge:** `src/lib/outlets/branch-scope.ts` and `branch-scope-query.ts`.
Branch scoping is an *authorisation* boundary — a branch account must not read another
branch's orders. Confirm the server-side filter uses the account scope, not the owner's
drill-down selection.

### C. Inventory & stock ledger

- `src/lib/inventory/` — 39 modules: ledger, depletion, recipes, low-stock, auto-86
- Migrations: `inventory_stock_ledger`, `inventory_low_stock_alerts`,
  `stock_movements_order_id_text`, `menu_items_auto_disabled_at`
- Evidence: 16 `inventory-*.tdd.md` reports, including a live end-to-end run

**What a human must judge:** depletion idempotency and exact-reversal restore in
`order-depletion.ts` / `order-stock-service.ts`. Double-depletion silently corrupts stock.

### D. POS register & superadmin console (merchant app)

- `webnegosyo-app/app/` register + superadmin screens, `webnegosyo-app/lib/pos-*.ts`
  (`pos-cart.ts`, `pos-cash.ts`, `pos-catalog.ts`)
- `src/lib/superadmin/bridge.ts` + `src/app/api/superadmin/[action]/route.ts` — bridge
  contract and route (bearer auth)
- Evidence: `inventory-pos-depletion.tdd.md`, `superadmin-app-phases-0-2.tdd.md`,
  `register-incoming-orders.tdd.md`, `order-editing-pos-mode.tdd.md`

**What a human must judge:** bearer-token verification in `src/lib/superadmin/bridge.ts` —
this route grants platform-wide access, so a weak check is a full-platform compromise.

## 3. Suggested reading order

1. `supabase/migrations/` (18 files) — the data model everything else assumes
2. `src/lib/outlets/branch-scope.ts` + `src/lib/order-backend.ts` — the two new
   cross-cutting decisions
3. The security-sensitive files flagged above (one per workstream)
4. `docs/testing/*.tdd.md` for any slice whose intent is unclear
5. `webnegosyo-app/` last — the largest surface, but mostly *new* screens rather than edits
   to existing ones

## 4. Manual QA checklist

Automated tests cover the logic; these are the journeys worth clicking through on the preview
deployment before merge.

**Storefront**
- [ ] Single-branch tenant (multi-branch off) orders exactly as before — no branch prompt
- [ ] Multi-branch tenant, timing = *before the menu*: chooser appears, mode tiles → outlet cards
- [ ] Multi-branch tenant, timing = *at checkout*: menu loads first, branch asked at checkout
- [ ] Dine-in branch maps to the right order type
- [ ] An out-of-stock dish is listed but not orderable

**Admin**
- [ ] Orders list shows the branch that took each order, and filters by it
- [ ] A branch account sees only its own branch's orders (log in as one and confirm)
- [ ] Owner portfolio drill-down: branch KPIs and the single verdict per branch render
- [ ] Inventory: receive stock → dish stays sellable; deplete to zero → auto-86 fires;
      restock → dish returns

**Merchant app**
- [ ] POS counter sale completes and depletes stock
- [ ] Cancelling that order restores exactly what it took
- [ ] A new web order rings **only** the branch that has to act on it

**Both order backends**
- [ ] Repeat the order-placement path once on a `convex` tenant and once on a `platform`
      tenant — this PR's central risk is divergence between the two

## 5. Deploy checklist

Merging the code is not the whole change:

- [ ] All 18 migrations are applied (verified as of this writing — re-confirm at merge time,
      and note the migration filenames' timestamp prefixes differ from the applied versions
      because they were applied out of band)
- [ ] Push the Convex bundle and bump `CURRENT_SCHEMA_VERSION` so existing Convex tenants
      pick up the parity and branch-targeted-notification changes — **without this, Convex
      tenants keep the old behaviour**
- [ ] Rebuild and ship the merchant app for the branch-targeted push and the superadmin
      impersonation push-token fix

## 6. Merge recommendation

**Squash merge.** The ~300 commits are a TDD working record, valuable in the branch history
and in `docs/testing/`, but not something `main` needs commit-by-commit.

Going forward the fix for this situation is smaller PRs — one workstream per branch, merged
as it completes, rather than four features growing on one branch for weeks.
