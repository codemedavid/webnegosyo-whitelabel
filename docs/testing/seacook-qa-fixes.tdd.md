# SeaCook QA handoff (2026-09-02) — TDD evidence

## Source plan

The handoff tarball `seacook-qa-grok-code-handoff.tar.gz` was 0 bytes; the spec is the
QA text pasted into the session (BUG-1 … BUG-6 plus P2/security notes). No screenshots or
Lighthouse JSON were available. Journeys below were derived from that text.

Scope guard honoured: SeaCook only (`11bf69ad-e01f-42b2-9374-c0e085aa5307`), no publish,
no SMS, no paid order, no branding written to any tenant.

## User journeys

1. As a superadmin opening a merchant's inventory, I want to receive stock so on-hand moves.
2. As a merchant in Branding Studio, I want the live preview to paint, or tell me why not.
3. As a guest on a phone, I want the menu's first cards to load fast without a layout jump.
4. As a merchant who just added an ingredient, I want the page to agree with itself.
5. As a guest, I want the four "Mixed Seafoods" rows to be distinguishable.
6. As platform staff typing `/superadmin/restaurants`, I want to land on the list.

## Task report

| Bug | Root cause (verified) | Fix | RED | GREEN |
|---|---|---|---|---|
| BUG-1 | `stock_movements` policies (migration 20260809) use `app_user_may_reach_branch`, which needs an `app_users` row of the tenant; superadmins have `tenant_id NULL`. Proven live: superadmin JWT `SELECT stock_movements` → `[]` while service role sees rows. Sibling tables all had a `*_manage_superadmin` policy; the ledger did not. `fail()` also swallowed the PostgREST object into the generic string. | `supabase/migrations/20260902120000_stock_movements_superadmin_rls.sql` (SELECT + INSERT only, ledger stays append-only); `fail()` logs non-Error refusals server-side. **Migration APPLIED to production 2026-09-04 via Supabase MCP** (`stock_movements_superadmin_rls`); probe as the superadmin JWT now sees 21 ledger rows (14 SeaCook), identical to the service role. | `lets a platform superadmin read/write` ✕ 2 | 4/4 |
| BUG-2 | **Not reproduced.** The framed URL renders at top level, inside a cross-origin iframe, and inside a same-origin iframe with the studio's exact draft/inspect messages replayed (a11y tree shows header, bar, cards). No frame-blocking headers. The studio itself needs a password login, which was not performed. | `PreviewFrame` shows "The preview did not load" + open-in-new-tab link + retry when no ready signal arrives within 8 s; retry remounts the iframe. | `names the problem…`, `clears the notice…` ✕ 2 | 4/4 |
| BUG-3 | Title templated twice (`Menu \| ${name}` under `%s \| ${name}`); mapbox-gl.css in the root `<head>`; every card `loading="lazy"`; `fill` images estimated from the MAX `sizes` branch (792px) with no srcset and no `f-auto`; all five Google font families loaded for every tenant; pixel bootstrap as a blocking inline script. SeaCook renders through the **mosaic** layout with a dual mobile/desktop copy, so the grid fix alone changed nothing on SeaCook. | Titles bare under the template; `useMapboxStylesheet` only where the autocomplete mounts; next/image CDN loader → real srcset + `f-auto`, mobile-first default src; `src/lib/above-the-fold.ts` applied in grid, grouped, mosaic, grid-focus, magazine; `EagerImagesProvider` keeps the CSS-hidden desktop copy lazy; fonts scoped to the tenant's `font_pair` (null → none); pixel via `next/script afterInteractive`. | 7 suites RED (see Test specification) | all GREEN |
| BUG-4 | `InventoryHealthStrip` read a server-computed `health` prop frozen at page load; the table read client state appended on save. | `InventoryManager` re-summarises health from the live ingredient list when the page passes `healthFlags`. | `counts the rows the table shows` ✕ | 2/2 |
| BUG-5 | Data: three rows literally named "Mixed Seafoods"; two of them exact duplicates (same price, image, "No rice"); photos are real SeaCook-branded product shots, not a fallback. | SeaCook rows renamed via service role: "Mixed Seafoods (No Rice)", "Mixed Seafoods (1 Java Rice & Drink)"; the newer duplicate (no add-ons, no orders) renamed "…[duplicate]" and set unavailable — deletion is out of scope. | n/a (data) | verified by re-read |
| BUG-6 | No in-app link to `/superadmin/restaurants`; the label "Restaurants" invites typing it. Search state was `useState` only. | `src/app/superadmin/restaurants/page.tsx` redirects (forwards `?q=`); tenant search initialises from `?q=` and `router.replace`s it; input `type="text"` (removes the second clear icon). | 4 ✕ + module missing | 7/7 |
| Security | `[tenant]/layout.tsx` passed the full `select('*')` tenant row to the client footer. | `omitTenantSecrets` strips 8 credential columns before `SiteFooter` and the footer content pages. Verified locally: no `lalamove_secret_key` / `loyverse_access_token` / `supabase_order_service_key` in the menu HTML. | module missing | 3/3 |

Validation commands run: `npx jest <file>` per suite (RED then GREEN), `npx jest` (full),
`npx eslint <changed files>` (clean), `npx tsc --noEmit` (no errors in changed files; three
pre-existing errors in `src/lib/mcp/superadmin-consent.ts` untouched), local `next dev` render
of `/seacook/menu` inspected via curl and DevTools.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | After all migrations, `stock_movements` grants superadmins SELECT and INSERT, keeps the branch predicate, grants nobody UPDATE/DELETE | `tests/unit/inventory-ledger-superadmin-rls.test.ts` | migration scan | PASS |
| 2 | Preview pane stays quiet while loading and after READY; announces + links + retries after 8 s of silence | `tests/unit/preview-frame-fallback.test.tsx` | component | PASS |
| 3 | Health strip counts the live list; instruction still leads on a truly empty list | `tests/unit/inventory-health-live-count.test.tsx` | component | PASS |
| 4 | `/superadmin/restaurants` → `/superadmin/tenants` (with `?q=`) | `tests/unit/superadmin-restaurants-redirect.test.tsx` | page | PASS |
| 5 | Tenant search initialises from `?q=`, writes debounced value to the URL, clears it | `tests/unit/tenant-manager-url-search.test.tsx` | component | PASS |
| 6 | No `[tenant]` page/layout title re-includes the tenant name under the template | `tests/unit/tenant-page-titles.test.ts` | metadata + source scan | PASS |
| 7 | Mapbox stylesheet inserted once, only when enabled; root layout has no mapbox link | `tests/unit/use-mapbox-stylesheet.test.tsx` | hook + source | PASS |
| 8 | CDN `fill` images emit a multi-width srcset with `f-auto` and a ≤640px default src | `tests/unit/optimized-image-responsive.test.tsx` | component | PASS |
| 9 | Grid marks the first 4 cards priority; templates render eager + `fetchpriority=high` | `tests/unit/menu-grid-priority.test.tsx` | component | PASS |
| 10 | Grouped grid counts the fold across category boundaries | `tests/unit/menu-grid-grouped-priority.test.tsx` | component | PASS |
| 11 | Fold helper math; every `layouts/layout-*.tsx` passes `priority` to every card it maps | `tests/unit/above-the-fold.test.ts` | unit + source scan | PASS |
| 12 | A card inside `EagerImagesProvider enabled={false}` stays lazy | `tests/unit/eager-images-context.test.tsx` | component | PASS |
| 13 | Font href is null without a pairing; only that pairing's families otherwise | `tests/unit/storefront-theme.test.ts` | unit | PASS |
| 14 | Pixel bootstrap renders via next/script `afterInteractive` | `tests/unit/components/meta-pixel-bootstrap.test.tsx`, `tests/root-layout-meta-pixel.test.tsx` | component | PASS |
| 15 | Credential columns removed, input not mutated, null passes through | `tests/unit/tenant-public.test.ts` | unit | PASS |

## Local verification of the storefront (next dev, `/seacook/menu`)

- `<title>` → `Menu | SeaCook`
- mapbox-gl.css links → 0; Google Fonts link → none (SeaCook has no `font_pair`)
- first four (mobile-copy) card images → `loading="eager"` + `fetchpriority="high"`; 11 lazy
- card `src` → `tr=w-430,c-at_max,f-auto`, srcset from 256 px up
- credential column names in HTML → 0

## Coverage and known gaps

- Full suite: 5 pre-existing suites fail for lack of live env vars (`lib/cache`, `lib/order-token`,
  `lib/leads/*`, `tests/integration/inventory-live-e2e`); identical on origin/main.
- **BUG-1 acceptance (Receive 20 → on hand 20; deduction on order) is still untested in the UI after the
  migration apply.** SeaCook also has zero recipes, so deduction stays blocked until one
  is wired; not done here because the receive itself is still refused.
- **BUG-2 acceptance is unverified.** If the pane is still blank after deploy, the new fallback
  will say so and give the framed URL; check the browser console for a framing refusal.
- **BUG-3 acceptance (mobile LCP < 4 s) must be measured on production after deploy.** The
  `cookies()`-forced dynamic rendering (TTFB ~1 s, `no-store`) was deliberately left alone.
- P2 items not done: native `<select>` for the stock unit, welcome/order-type confirmation,
  SMS page, POS in web admin, helper-text contrast, spinner timings.

## Merge evidence

Twelve commits on `seacook-qa-fixes`, one RED test commit followed by one GREEN fix commit per
bug (`git log --oneline origin/main..seacook-qa-fixes`). If squashed, keep this file.

## Integration with the current storefront (2026-09-16)

Ported the outstanding fixes without replacing the current storefront runtime or
its availability guards. Kept the scoped font implementation already on main;
only the duplicated menu title needed changing in the menu layout. The new
storefront pack renders one selected device layout, so the old hidden desktop
wrapper was unnecessary. Card priorities and responsive image sources still
apply to that single layout.

Adapted metadata tests to the current narrow tenant query. The focused QA and
storefront regression run passed 26 suites / 146 tests. This integration did not
deploy the application or apply database migrations; the production statements
above describe the earlier branch session.
