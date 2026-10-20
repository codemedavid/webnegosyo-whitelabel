# Sales reports (Phase 1): TDD evidence (Reports & Inventory suite)

Plan: `docs/plans/2026-10-12-reports-and-inventory-suite.md` §3, §4, §5, §7.2–7.3, §9 Phase 1, §10.
Date: 2026-10-14. Branch: `feat/reports-inventory`.
Migrations, all APPLIED to the platform project and probed:
- `20261014110000_report_sales_functions.sql` (as `report_sales_functions`)
- `20261014130000_report_functions_index_paths.sql` (as `report_functions_index_paths`)
- `20261014140000_report_helpers_inline.sql` (as `report_helpers_inline`)
- `20261014150000_report_payments_name_aliases.sql` (as `report_payments_name_aliases`), from the signed-in check below

`src/types/supabase.ts` was regenerated through the Supabase MCP. The diff was purely additive: the seven report functions, plus tables other sessions had applied (`approval_requests`, `approval_rules`).

## What shipped

| Piece | Behaviour |
|---|---|
| **SQL report functions** | `report_sales_summary`, `_by_period`, `_by_dimension` (source / order_type / outlet), `_by_hour`, `_by_item`, `_by_category`, `report_payments`.<br>Each is SECURITY INVOKER, so RLS applies, and checks the `reports` key (42501). Ranges are capped at 93 days and invalid input is refused (22023). The only time zone allowed is `Asia/Manila`.<br>Helpers live in the non-exposed `reporting` schema. They mirror `sales-model.ts` / `payment-buckets.ts` / `sales-breakdowns.ts` to the centavo. |
| `src/lib/reports/read/report-rpc-rows.ts` | zod-validated row mappers. A row in the wrong shape fails loudly; it never reads as ₱0. |
| `src/lib/reports/read/report-rpc.ts` | Typed calls through the caller's **own session client**. Function names are checked against the generated schema at compile time.<br>Every read returns a result instead of throwing, so one failed card never takes the page down:<br>• 42501 → "needs the Reports permission"<br>• 22023 → the function's own sentence<br>• anything else → a generic message, with the detail logged server-side |
| `src/lib/reports/read/report-scope.ts` | The fail-closed `reportAccessFor`. These are refused, each with its reason: a missing account row, another store's account, an account without `reports`, and platform staff (whom `app_user_has_permission` refuses too).<br>`reportBranchArgs`: a branch-locked account always reads its own branch, whatever the URL says. A store-wide account may pick one of the store's own branches or `unassigned`. |
| `src/lib/reports/read/report-context.ts` + `load-report-context.ts` | Builds a page's whole decision before any figure is read: access, then backend, then period. An invalid custom range falls back to the default with a stated reason. It also decides the comparison windows, the branch picker (2+ active branches and the flag on, plus Unassigned), the locked chip, and the mixed-backend note. The loader is request-cached and treats an errored `app_users` read as no account. |
| `src/lib/reports/report-view-model.ts`, `breakdown-view.ts`, `metric-glossary.ts`, `report-links.ts` | Pure view logic:<br>• trend alignment: zero-filled, comparison paired by position, null where it runs out<br>• the reconciling totals ledger<br>• per-row comparison join<br>• dimension label mappings<br>• the breakdown registry<br>• busiest hours<br>• the Menu matrix (the existing `classifyMenu`, fed the SAME item rows as the table)<br>• one definition per ⓘ<br>• links that keep the filters |
| Pages | `/[tenant]/admin/reports` is the overview: insight sentence, 4 KPI tiles with deltas and ⓘ, trend with a dashed comparison and a table toggle, "Break it down", the totals ledger plus a voids line, and the BIR footer (§2.3).<br>`/[tenant]/admin/reports/[dim]` covers `items` (ranked list and Menu matrix, plus Picked together for store-wide accounts), `categories`, `payments` (100% bar plus method table), `channels` (channel and order type), `hours` (heatmap and busiest slots) and `branches` (store-wide, multi-branch only). An unknown dimension returns a 404. |
| Sidebar | New **Reports** section (Sales, Product Analytics) and **Stock** section (Stock, Transfers, Stock history). Stock left the Menu group, and the "Analytics" group is gone.<br>`isPlatformBackend` (from `resolveOrderBackend`, never from credentials) hides Product Analytics on platform stores and hides Sales on Convex and tenant-database stores. |
| Product Analytics | A platform store is redirected (307) to `/admin/reports/items?view=matrix`. A Convex store keeps the page until Phase 7. |

## RED → GREEN

Honest order: what was test-first, and what was written alongside its test.

1. **`allocateCents` exact remainders** (both web and app copies). RED: `allocateCents(3,[2134,3737,1335])` gave `[1,1,1]` from float ties; the exact SQL gives `[1,2,0]`. GREEN with BigInt remainders. The app copy needs an OTA.
2. **`payment-buckets` labels.** RED on "a named label beats Not recorded" and "ties go to code-point order". GREEN.
3. **`sales-breakdowns`** (9 tests): RED, module missing. GREEN.
4. **SQL parity** (`report-sql-parity.property.test.ts`): 200 generated stores across a month end, plus the hand-built edge store. 12 RPCs per store against the engine, to the centavo.
   - The first generator let 4 of 6 SQL mutations survive. It was extended (deleted dishes, renamed and oddly spelled names and categories, full returns, method-name variants, overstated delivery discounts) and given `EDGE_STORE`, and now kills all 16 mutations.
5. **SQL access** (`report-sql-access.test.ts`): 21 cases plus "every function refuses no-reports", run against the live policies AND with HIGH-3 (44 tests). It covers anon, owner, legacy NULL, analytics ⇒ reports, reports alone, orders+pos refused, menu refused, another store refused, branch-locked confined (another branch or unassigned = 0 orders), superadmin, service role, and range/grain/time-zone/dimension refusals.
6. **`report-scope.test.ts`** (16): RED, module missing. GREEN.
7. **`report-rpc.test.ts`** (8) and **`report-context.test.ts`** (10): written alongside their modules, not test-first. To make up for it, 7 hand mutations (permission mapping, unassigned arg, multi-branch threshold, locked-branch URL echo, refusal-before-backend order, other-store check, trend pairing) were each run. **All 7 were killed.**
8. **`report-view-model.test.ts`** (16), **`breakdown-view.test.ts`** (7), **`report-links.test.ts`** (4): each RED, module missing, then GREEN.
9. **`admin-sidebar-visibility.test.ts`**: RED on 3 new cases. GREEN. The regression lock is unchanged (an unknown backend changes nothing).
10. **`admin-shell-tenant.test.ts`**: `is_platform_backend` follows `resolveOrderBackend`, so a leftover Convex URL on a pinned platform store still reads as platform.
11. **`ui/sales-pages.test.tsx`** (11): the pages' async server components are rendered from fake function rows. It checks:
    - the figures on screen are the rows' figures
    - Σ items = net in the table footer
    - a failed trend read stays in its card
    - a 42501 reads as a permission message
    - the matrix quadrants
    - payments unpaid kept separate
    - branches + Unassigned = store
    - busiest hours
    - axe structure rules clean on the overview, the items table and the matrix (contrast needs a real browser)

## Code review (independent reviewer, read-only)

The verdict was APPROVE, with no CRITICAL or HIGH findings.

**Fixed.** Each fix comes with a test, and each test was checked by reverting its fix to confirm the test fails:
- Picked together is now hidden while one branch is picked, since it covers the whole store over 90 days.
- The Payments order column has no total sum, because a split-paid order sits under two methods.
- A failed menu read now stays inside the Menu matrix card instead of taking out the page.
- The totals ledger's third block now closes with "= Total billed".
- A no-op `cache()` was removed.
- The back link and the view switch are now 44 px tall at every width.
- The matrix's "too few sales" text no longer depends on the wording of classifier warnings.

**Left as is:** `console.error` in `report-rpc.ts`, which is server-side only and follows the existing service pattern.

## Live verification (platform DB)

### The outage, and the rule that came out of it

On 2026-10-14 at 06:52 UTC, a timing probe of the FIRST version of these functions ran unbounded as gungjeon's owner. `set local role authenticated` does not apply that role's statement timeout. The function's generic plan hash-joined all of `order_items` and evaluated its RLS check per row, and the platform DB stopped accepting connections until it restarted at 07:00:17.

The fixes:
- **130000:** PL/pgSQL `RETURN QUERY EXECUTE … USING` (custom plans), and children fetched by `order_id = any(array(select …))` (index path, leakproof uuid `=` before RLS).
- **140000:** the immutable helpers lose `SET search_path`, so they inline.

Every live probe since starts with `set local statement_timeout` (5–8 s), uses a one-day window first, and runs a plain EXPLAIN before executing. This is saved as a memory rule.

### Timings, as gungjeon's owner (≈6.8k orders / 30 days)

| Function | 1 day | 30 days | 92 days |
|---|---|---|---|
| summary | 81 ms | 196 ms | 296 ms |
| by period / dimension / hour | — | 185–193 ms | — |
| payments | 55 ms | 233 ms | — |
| by item / by category | 93 ms | 669 / 695 ms | 938 ms (item) |

Item and category at 30 days sit about 15% over the 600 ms month budget (§10.4). They are on the follow-up list. The default view (this week) is well under.

### Reconciliation, gungjeon, 30 days (2026-09-13T16Z → 2026-10-13T16Z)

| Check | Result |
|---|---|
| Orders: RPC vs independent SQL | 6,760 = 6,760 |
| Billed | 172,126,578 = 172,126,578 centavos |
| Service | 8,213,031 = 8,213,031 |
| Net = Σ items = Σ categories = Σ days | 163,726,807 on all four |
| net + service + delivery = billed | true |
| Collected = Σ payment methods | 162,911,944 |
| collected − overpaid + unpaid = billed | true |

Advisors: no new ERRORs. There are six expected `function_search_path_mutable` WARNs on the inlined `reporting` helpers (immutable, schema-qualified bodies, not exposed). They are documented in migration 140000.

## Checks

- `npx jest tests/unit/reports …`: 37 suites / 482 tests pass, plus the 11 page tests.
- `tsc -p tsconfig.build.json`: clean.
- `npm run build`: passes. `/[tenant]/admin/reports` is 550 kB first load (Recharts), and `[dim]` is 561 kB.
- `npm run lint` on every touched path: 0 errors. 4 pre-existing unused-arg warnings remain in the parity test.

## Signed-in check on the live database (SeaCook owner, 2026-10-14)

The pages were run against the platform DB as SeaCook's owner on a local dev server (Playwright, desktop 1280 px and phone 390 px). Pages covered: the overview (this month and this week), items (ranked list and matrix), categories, payments, channels and hours, plus an invalid custom range, the branches 404 and the Product Analytics redirect.

**How the subscription gate was handled.** SeaCook's subscription is on hold, so the admin layout redirects to `/subscription`. For this run only, that one redirect was disabled in the local copy of `src/app/[tenant]/admin/layout.tsx`. The file was restored byte-for-byte afterwards (`git diff` empty). The store's billing was not touched.

**What passed:**
- Every report page rendered.
- No card showed an error.
- There was no horizontal scroll at 390 px.
- axe (contrast included) reported 0 violations on every report page. The only finding was on Next's own 404 page.
- Product Analytics redirected to `items?view=matrix`.
- The bad range fell back to this week and said why.
- The single-branch store got a 404 for `branches` and has no branch picker.
- The figures agree with each other:
  - net ₱3,148 = items total = categories total = channels total = order-type total
  - billed ₱6,076 = net + delivery ₱2,928
  - collected ₱3,596 + unpaid ₱2,480 = billed

**Two defects found and fixed:**
1. **Payments showed two "Cash" rows.** Web orders store the Cash method's id; the register stores only the word "Cash".
   - **RED:** the engine tests "a name-only payment joins the one method with that name" and "split by id and by name is one slice" both failed. The parity suite then failed against the old SQL.
   - **Fix:** `nameAliases()` in `payment-buckets.ts` plus migration 150000. A name-only key joins the single id key carrying that folded name in the window. Two methods sharing a name stay apart. The rekey happens before the per-order netting and the distinct order count.
   - **Tests:** the edge store gained e7–e11 (two "Cash" ids, GCash by id and by name, an id without a name). All three SQL mutations are killed: dropping the uniqueness rule, dropping the "Not recorded" filter, and dropping the join.
   - **Live:** APPLIED. SeaCook now shows one Cash row (₱3,596, 7 orders). On gungjeon over 30 days, Σ methods = collected = 162,911,944, in 322 ms. No new advisors.
2. **The comparison line was a smoothed curve.** It drew a hump between days, implying values that never existed. It is now straight dashed segments with a dot per bucket.

**Seen, not caused here:** a hydration warning on the sidebar's Menu group (`aria-controls` from `useId`). It also appears on `/admin/orders`, which this work doesn't touch.

## Not done in this phase (stated, not hidden)

- The signed-in check ran on a dev server, not a production deploy. Sentry's 48 hours start at deploy.
- **Deviations from the plan:**
  - Native date inputs instead of shadcn calendar/popover.
  - "Save view" is deferred.
  - `day_ends_at` is deferred (schema not in this phase).
  - The VAT block needs `tenants.vat_registered` (not built), so only the BIR footer ships.
  - A filter change shows skeletons, not the old figures at 60%.
  - Product Analytics redirects with 307, not 301, because the answer depends on the store's backend.
- **Not shown to branch-locked accounts:** Picked together, because it reads the whole store's baskets with the service role.
- **Platform staff** see a plain "not available in support view yet". The DB function refuses them; adding them is a `app_user_has_permission` change for later.
- **Deploy:** the 0d runbook (apply 120100 and 120200) is still owed. The app's `allocateCents` change needs an OTA.
