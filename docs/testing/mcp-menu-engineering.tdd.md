# TDD Evidence: Strategy-Capable SmartMenu MCP

**Branch**: `feat/android-sms-followups`
**Date**: 2026-08-04
**Source plan**: none on disk — journeys were derived during the `/ecc:plan` run in this session and confirmed by the user with "proceed".

## Assumptions taken

The plan closed with three open questions. The user answered "proceed", which was
taken as agreement with the stated recommendations. Recording them because each
one is a policy decision, not a detail:

1. **SMS campaigns default to `status: 'draft'`** — deliberately diverging from
   the merchant app, which saves campaigns LIVE
   (`webnegosyo-app/lib/sms/campaigns-repo.ts`). A merchant filling in a form has
   said what they want; an AI making a tool call has not.
2. **All six phases, in order** — phases 3–5 are strategy-blind without 1–2.
3. **Costs are an op input, not a new column** — no migration; profitability
   falls back to an explicitly-labelled price proxy when costs are absent.

## User journeys

1. As an operator, I want the MCP to see what actually sells, so its advice is
   grounded in the tenant's real orders rather than a guess.
2. As an operator, I want it to classify the menu (star/plowhorse/puzzle/dog)
   from that evidence, and to refuse when the evidence is too weak.
3. As an operator, I want it to rearrange categories and items by that
   classification without corrupting the existing order.
4. As an operator, I want it to give many items the same add-ons in one call
   without destroying the per-item extras already configured.
5. As an operator, I want it to build bundles and upsells, and to be told when
   they will not be visible because a feature flag is off.
6. As an operator, I want it to draft SMS campaigns for new promos without ever
   being able to text customers unattended or fabricate consent.

## Task report

| Phase | What was built | RED evidence | GREEN evidence |
|---|---|---|---|
| 1 | `menu-performance-merge.ts` (pure aggregation) | `Cannot find module '.../menu-performance-merge'` | 15/15 |
| 1 | `menu-performance.ts` (backend routing) + `get_menu_performance` op | module not found; then 4 failing op tests | 24/24, then 40/40 |
| 2 | `menu-engineering-classify.ts` + `classify_menu` / `apply_menu_classification` | module not found; then 5 failing op tests | 16/16, then 36/36 |
| 3 | `menu-arrangement.ts` + `reorder_categories` / `reorder_menu_items` | module not found; then 3 failing op tests | 8/8, then 55/55 |
| 4 | `addon-bulk-attach.ts` + `attach_addon_library_entries` / `list_addon_library` | module not found; then 2 failing op tests | 7/7, then 68/68 |
| 5 | `mcp/feature-flag-warnings.ts` + `list_bundles` / `list_upsell_pairs` | module not found; then 4 failing op tests | 10/10, then 58/58 |
| 6 | `sms-campaign-draft.ts`, `sms-campaigns-service.ts` + `create_sms_campaign` / `list_sms_campaigns` | module not found ×2; then 4 failing op tests | 17/17, 7/7, then 105/105 |

Validation command used throughout:

```bash
npx jest --config jest.config.cjs --testPathPatterns="<suite>"
```

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | An empty sales read reports "no order data", never "every item sold zero" | `tests/unit/menu-performance-merge.test.ts` | unit | PASS |
| 2 | A `numeric` column returned by PostgREST as a string is summed, not concatenated | `tests/unit/menu-performance-merge.test.ts` | unit | PASS |
| 3 | Sales for a deleted item group by name instead of collapsing into one phantom item | `tests/unit/menu-performance-merge.test.ts` | unit | PASS |
| 4 | A Convex tenant is read from its own deployment, never from the platform database | `tests/unit/menu-performance.test.ts` | unit | PASS |
| 5 | A tenant with missing credentials does NOT fall back to another database | `tests/unit/menu-performance.test.ts` | unit | PASS |
| 6 | `order_items` is filtered through the `orders` join (it has no `tenant_id`) | `tests/unit/menu-performance.test.ts` | unit | PASS |
| 7 | Nothing is classified when the sales read was incomplete or under 20 units | `tests/unit/menu-engineering-classify.test.ts` | unit | PASS |
| 8 | Profitability is labelled `price_proxy` unless every item has a cost | `tests/unit/menu-engineering-classify.test.ts` | unit | PASS |
| 9 | `classify_menu` writes nothing; `apply_menu_classification` writes only what it was given | `tests/unit/provisioning-ops.test.ts` | unit | PASS |
| 10 | A partial reorder is refused rather than interleaving the omitted rows | `tests/unit/menu-arrangement.test.ts` | unit | PASS |
| 11 | A failed reorder write raises instead of returning quietly | `tests/unit/menu-arrangement.test.ts` | unit | PASS |
| 12 | Bulk add-on attach PRESERVES each item's existing add-ons and is idempotent | `tests/unit/addon-bulk-attach.test.ts` | unit | PASS |
| 13 | A promo written behind a disabled flag returns a warning saying so | `tests/unit/mcp-feature-flag-warnings.test.ts` | unit | PASS |
| 14 | An unreadable tenant is treated as flag-OFF, never assumed enabled | `tests/unit/mcp-feature-flag-warnings.test.ts` | unit | PASS |
| 15 | A schedule missing its steering field is refused by name, not by Postgres | `tests/unit/sms-campaign-draft.test.ts` | unit | PASS |
| 16 | Campaigns default to `draft`; no consent/opt-out/suppression field is ever written | `tests/unit/sms-campaign-draft.test.ts` | unit | PASS |
| 17 | No registered op has a name matching consent/opt-out/suppression | `tests/unit/provisioning-ops.test.ts` | unit | PASS |
| 18 | Every op advertises a non-empty object schema the MCP SDK can expose | `tests/unit/provisioning-ops.test.ts` | unit | PASS |
| 19 | No op name implies deletion (existing guardrail still holds with 12 new ops) | `tests/unit/provisioning-ops.test.ts` | unit | PASS |

## Coverage

```bash
npx jest --config jest.config.cjs --coverage --collectCoverageFrom='src/lib/...' \
  --testPathPatterns="menu-engineering-classify|menu-arrangement|addon-bulk|sms-campaign|menu-performance|feature-flag|provisioning-ops"
```

```
All files   | 98.46 % Stmts | 87.09 % Branch | 97.05 % Funcs | 98.46 % Lines
```

Full suite: `447 suites passed, 5444 tests passed, 0 failed` (1 suite / 8 tests
skipped, both pre-existing).

## Known gaps and deferred work

Stated plainly rather than implied as done:

- **`update_bundle` / `update_upsell_pair` were NOT built.** Creation and reads
  are covered; editing an existing bundle or pair from the MCP still requires
  the admin UI. Deferred as lower value than the creation path the request
  centred on.
- **`get_upsell_coverage` and `suggest_upsell_pairs` were NOT built.** The
  underlying `getItemsNotInAnyUpsell` and `generateSmartPairSuggestions` exist in
  `menu-engineering-service.ts` but still lack a `ProvisioningCtx` path.
- **`preview_sms_audience` was NOT built.** It needs the pure `audience.ts`
  extracted from `webnegosyo-app` into a location both packages import; that
  extraction is the real work and was out of scope here. A campaign's recipient
  count therefore cannot be previewed before activation.
- **No end-to-end probe against the live MCP.** Every guarantee above is unit
  level with injected clients. The ops have not been exercised through the real
  `/api/mcp/mcp` transport against a scratch tenant.
- **Convex reads reuse the deployed `analytics:getTopItems`** with a raised
  limit, so no Convex redeploy is needed — but the underlying query takes a
  bounded page of orders, so a very high-volume tenant will report
  `coverage.complete: false`. That is correct behaviour, not a silent cap.

## Unrelated latent bug found

`src/app/api/tenants/[id]/route.ts:83` deletes from `order_items` filtered by
`tenant_id`, a column that table does not have (verified against the live schema).
Out of scope for this work; flagged for a separate fix.

## Merge evidence

Checkpoint commits on `feat/android-sms-followups`, oldest first:

```
37bc34a test: add per-item sales aggregation spec for the MCP menu-engineering read
7446d85 feat: per-item sales aggregation for the MCP menu-engineering read
8f52478 feat: expose get_menu_performance on the SmartMenu MCP
<refactor> refactor: type the menu-performance test fixtures as MenuPerformanceTenant
<red>      test: add BCG classification spec grounded in real sales
<green>    feat: compute BCG classification from measured sales
<green>    feat: expose classify_menu and apply_menu_classification on the MCP
<red>      test: add spec for complete-or-reject menu arrangement writes
<green>    feat: expose reorder_categories and reorder_menu_items on the MCP
<red>      test: add spec for bulk add-on attachment
<green>    feat: attach add-on library entries to many items from the MCP
<red>      test: add spec for feature-flag warnings on MCP writes
6f8ee8e    feat: warn when MCP promo writes land behind a disabled feature flag
<red>      test: add spec for MCP-authored SMS campaigns
<green>    feat: validate MCP-authored SMS campaigns against the DB constraints
<red>      test: add spec for the MCP SMS campaign writer and reader
08aa39d    feat: expose create_sms_campaign and list_sms_campaigns on the MCP
```

Note: another Claude session committed to this branch concurrently (`2cff8b9`,
voucher picker work). Every checkpoint above was verified reachable from `HEAD`
via `git merge-base --is-ancestor`, and only explicit paths were staged.
