# Review refactors (2026-11-16): plan, awaiting the owner's OK

These came out of the 2026-11-15 review and QA pass. Every bug from that pass is already shipped (PR #146, #148). Each refactor below is a behaviour-preserving cleanup that touches several files, so it waits for a go-ahead. Pick any subset. Each refactor ships as its own PR, with the existing tests unchanged and a new contract test where one is listed.

## R1. One way to read past the 1,000-row cap

**Today** there are seven hand-written pagers:
- `src/platform/db/read-all-rows.ts` `readAllRows` (the reference)
- `src/lib/exports/read/detail-read.ts` `readAll`
- `src/lib/texts/server/paged.ts` `readAll`
- `src/lib/storefront/paged-select.ts` `selectAllPages`
- `webnegosyo-app/lib/backends/platform-client.ts` `readAllPages`
- `webnegosyo-app/lib/gov-reports/paging.ts` `readAllPages`
- `src/app/actions/checkout-leads.ts` `fetchAllPlatformPaymentMethods`

They differ in ordering tie-breaks, in their max-row guards, and in what happens on a partial failure.

**Change:**
- Web: every pager calls `readAllRows`. Keep `selectAllPages`'s keyset mode by adding it to `readAllRows` as an option.
- App: one `readAllPages` in `lib/backends/`, which the gov-reports pager calls.

**Proof:**
- Run each caller's suite against `tests/fixtures/fake-supabase-tables.ts`, which applies the 1,000-row cap.
- Add one parameterised test that fails if a new file defines a `.range(` loop outside the helper. This follows the same pattern as the other guardrail tests.

**Risk:** low, read-only. Do the storefront callers last: they sit on the request path.

## R2. One add-on "×N" label parser

**Today** five regexes read "Name ×2":
- `src/lib/order-item-display.ts`
- `src/lib/order-line-modifier-pricing.ts`
- `webnegosyo-app/lib/order-edit-cart.ts`
- `webnegosyo-app/lib/product-performance/modifiers.ts` (it also accepts `x`)
- `webnegosyo-app/lib/kitchen-tickets.ts` (trailing quantity, fixed 2026-11-15)

The variants already disagree: `x` vs `×`, and whether a space is required.

**Change:**
- One `addon-portion.ts`, byte-identical in web and app, with a parity test like `receipt-layout`.
- `parsePortionLabel(name) → { base, units } | null`.
- `nameCarriesCount(name, qty)` for tickets.

**Proof:** a table test over real names, including "Wings Box 6", "Coke x2", "Fries ×3" and "×" inside a name.

**Risk:** money paths (modifier pricing). The pricing parser keeps its exact current behaviour, pinned by the table test before the switch.

## R3. One reorder writer

**Today:** each reorder action writes `sort_order` one row at a time, in its own loop:
- categories, menu items, bundles, outlets, order types, checkout questions, payment methods
- University courses, modules and lessons

That means N sequential round trips, partial orders on a mid-loop failure, and no affected-row check (an RLS refusal is silent).

**Change:**
- One `reorder_rows(table, tenant, ids[])` SECURITY INVOKER RPC. It does a single `UPDATE … FROM unnest(ids) WITH ORDINALITY`, with a whitelist of tables and RLS applied. It returns the rows it changed.
- One TS wrapper that refuses when changed ≠ ids.length.

**Proof:**
- A PGlite runner per role: owner, staff without `menu`, branch-locked staff, another store.
- Each action's existing test.

**Risk:** this needs a migration, applied and probed before the web deploy.

## R4. Dependencies and dead parsers

- `postgres` (package.json) has no import anywhere in `src/` or `scripts/`. Remove it with `npm uninstall --package-lock-only` in a clean worktree. Shared `node_modules` is untouched.
- The `tenant_supabase` order-backend parsers are left over from the per-store backend, whose columns were dropped 2026-11-16. Delete them along with their tests once `git grep` confirms no caller.

## R5. Types instead of casts

`src/types/database.generated.ts` is now regenerated from live, and its drift check passes. Several readers still cast to `any`, because their tables were missing from the types when they were written:
- `report_exports` (`export-log.ts`)
- `store_onboardings`
- `assistant_*`
- the Owl insights readers

Moving them onto `Tables<'…'>` turns column typos into compile errors.

**Proof:** `npm run typecheck`. No runtime change.

## Not refactors: decisions only the owner can make

1. **`20261110120000_pos_stock_block_server`**: block stores refuse register oversells server-side. App ≥1.0.19 asks for a clearance at Charge, and 1.0.19 is the live iOS version. Android phones still on a 1.0.18-or-older APK don't ask, so their sales on the one active block store would get 42501. Apply once that store's registers are confirmed on ≥1.0.19.
2. **`20261107130100` (revoke cost columns)**: held (`supabase/migration-status.json`). Every merchant-app binary before 1.0.18 reads `unit_cost` directly and would get 42501. The gate is to raise `platform_app_releases.minimum_version` to 1.0.18 on both platforms first, which forces older phones to update. That is the owner's call.
3. **Customer app App Review number**: works only while the store's app is `draft`. Apple re-reviews every update, so the review number has to keep working after go-live. Two options:
   - (a) allow it whenever the app has a pending store submission;
   - (b) allow it always, but sessions expire after 24 h and only see a demo customer.

   Review sessions are never revoked today.
