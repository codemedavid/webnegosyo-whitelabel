# Custom Hero/Header Attacher — Canonical Design (Phase 2, consolidated)

**Status:** DESIGN ONLY. Phase-3 implementers build directly from this document. It reconciles the four Phase-2 design docs (`01-architecture.md`, `02-cart-integration.md`, `03-security.md`, `04-config-upload-schema.md`) into one consistent spec, with all inter-doc conflicts resolved (see §15).

**What this feature is:** a SUPERADMIN attaches HTML files that fully define the *look* of the menu page's header and hero, per-tenant, without editing core code each time. The HTML is LOOK-ONLY. The shopping cart in the header stays FULLY FUNCTIONAL (open/close drawer, add, remove, update qty, badge count, checkout) even when custom header HTML is attached, because the cart trigger is platform-owned React portaled into a marker inside the sanitized HTML. Missing/invalid/disabled/erroring custom HTML falls back to the default header/hero and never breaks the page. No XSS/CSP regressions.

**Locked decisions designed-to (not revisited):** D1 (never allow tenant scripts; strip `<script>`/`on*`/`javascript:`/non-image `data:`/dangerous CSS; LOOK-only; cart is platform-owned via portal), D2 (SUPERADMIN-only; toggles + editor/upload live in the superadmin tenant form), D3 (two independent fields + toggles, independent fallback, only the HEADER carries the cart mount marker), D4 (upload `.html` → FileReader → editable code field → preview → stored as TEXT; field stays editable; no new upload infra), DEFAULTS (per-tenant columns mirroring `hero_design`; expose branding via `generateBrandingCSS()` `--brand-*` vars injected on the custom-chrome wrapper only).

---

## 0. Verified facts (re-read live this session — cite when building)

### Rendering / mount
- Menu route: `src/app/[tenant]/menu/page.tsx` (Server, ISR `revalidate=300`) → `getMenuData()` in `src/app/[tenant]/menu/menu-server.tsx` → `<MenuClient/>` (Client).
- `getMenuData` uses an **explicit column allowlist** `.select(...)` at `menu-server.tsx:9-34`. **Any new tenant column MUST be added there or it is `undefined` on the menu page.** Hero fields on line `:23`; the result is cast `tenant = tenantData as unknown as Tenant` at `:43`.
- Provider tree: root `src/app/layout.tsx` > `QueryProvider` > `CartProvider` (layout.tsx:47, **APP-WIDE**) > `[tenant]/layout.tsx` > `menu/layout.tsx` (metadata only) > `menu/page.tsx` > `MenuClient`. Because `CartProvider` is at the root, anything `MenuClient` renders shares the same Cart Context — `useCart()` succeeds anywhere under it, including a portaled subtree.
- Menu route is CDN-cached: `next.config.ts:69-77` (`Cache-Control max-age=30 s-maxage=300 swr=60`). `getCachedTenantBySlug` (`src/lib/cache.ts:35-58`) adds React `cache()` + Redis. Saves must `revalidatePath('/<slug>/menu','layout')` AND `invalidateTenantCache(slug, tenantId)` (`cache.ts:208`).

### Header (inline, NOT a component) — verified
- `src/app/[tenant]/menu/menu-client.tsx:452-528` is the `<header>` (sticky top-0 z-50, inline style `backgroundColor: branding.header` / `color: branding.headerFont` / `borderColor: branding.border` at `:454-457`). Left cluster logo+store name `:462-499`. Right cluster cart trigger+badge `:501-525`.
- Cart trigger: `<button onClick={() => setIsCartOpen(true)} ...>` with 🛒 at `:502-519`. Badge: `{item_count > 0 && <span ...>{item_count > 99 ? '99+' : item_count}</span>}` at `:508-518` (colors `branding.menuCartBadgeBackground/Text`). The trigger has **no DOM id/class/data-attr** — pure React closure.
- `AdminEditPencil` is a local function at `menu-client.tsx:58-72`. The header uses it twice: `openBrandingEditor('main_header')` (`:492-497`) and `openBrandingEditor('cart_badge')` (`:520-524`).
- `src/components/shared/navbar.tsx` (Navbar) is DEAD CODE (zero importers) — do NOT target it.

### Hero (3 mutually-exclusive paths) — verified
- v4: `BlockHeroRenderer` mounted via IIFE at `menu-client.tsx:597-604`: `const heroDesign = tenant?.hero_design; const isBlockDesign = heroDesign && heroDesign.version === 4; if (tenant?.hero_section_enabled !== false && heroDesign && isBlockDesign) return <BlockHeroRenderer .../>; return null`. (Phase-1 cited `:596-604`; live is `:597-604` — a 1-line drift, immaterial.)
- legacy: `HeroRenderer` inside `LayoutDefault` (`layout-default.tsx:84-87`, version !== 4). default text hero `layout-default.tsx:88-116`. Both live inside `<main>` and are reached only when the top-level IIFE renders nothing. Neither uses `dangerouslySetInnerHTML`/script/style.

### Cart (React Context, `src/hooks/useCart.tsx`) — verified
- `CartContextType` `useCart.tsx:14-39`: `items, total, item_count, bundleItems, addItem(...), removeItem(id), updateQuantity(id, qty)` (clamps `MAX_QUANTITY=99`, `qty<=0` removes), `clearCart()`, `getItem(id)`, bundle ops, `orderType/setOrderType`, `messengerPsid/setMessengerPsid`, `tenantId, tenantSlug, setTenantContext`.
- `useCart()` THROWS outside `CartProvider` (`useCart.tsx:776-782`). `item_count` is a `useMemo` at `:721` = `getFullCartItemCount(items, bundleItems)` (`cart-utils.ts`), counting regular item quantities + bundle slot quantities × bundle quantity.
- **NO `isOpen`/`openDrawer` in context.** Drawer open state is LOCAL to MenuClient: `const [isCartOpen, setIsCartOpen] = useState(false)` (`menu-client.tsx:93`). `MenuClient` destructures `const { addItem, item_count, setTenantContext } = useCart()` at `:76`. `setTenantContext` called on mount (`:98-102`).
- `<CartDrawer open={isCartOpen} onClose={() => setIsCartOpen(false)} .../>` is a SIBLING at `menu-client.tsx:699-710` (`src/components/customer/cart-drawer.tsx` — Radix Sheet, portals to `document.body`; consumes `useCart` at `:61`; qty +/-, remove, checkout `router.push('/<slug>/checkout')`). The drawer already renders OUTSIDE the header DOM.
- `MenuClientProps` `menu-client.tsx:23-31` (`tenant, categories, allMenuItems, bundles, tenantSlug, isBrandAdmin, error`). `branding` via `getTenantBranding(tenant)` memoized at `:189` (final at `:208-211`).

### Storage / save precedent — verified
- `hero_design jsonb` typed at `src/types/database.ts:65`; `hero_section_enabled` at `:119`. In `supabase.ts`, tenants blocks: **Row `hero_section_enabled` at :1280, Insert at :1401, Update at :1522** (`hero_design` immediately above each).
- **Live save path is the ACTIONS, not the service.** `tenant-form-wrapper.tsx:1374` calls `updateTenantAction(tenant.id, input)`; `:1383` calls `createTenantAction(input, prefill?.leadId)` (`src/actions/tenants.ts`). Both gate via `verifySuperadmin()` (`tenants.ts:19-40`, checks `app_users.role === 'superadmin'`), called create `:45` / update `:200`. Each builds its own explicit allowlist payload: `insertPayload` `:73-150`, `updatePayload` `:217-294`. **A new column MUST be added to both or it silently won't persist.** `createTenantSupabase`/`updateTenantSupabase` in `tenants-service.ts` are a parallel/duplicate path (have their own payloads); keep in sync to avoid drift.
- `createTenantAction` revalidates only `/superadmin` + `/superadmin/tenants` then `redirect('/<slug>/menu')` (`:170-183`) — so any added menu revalidation MUST run **before** the redirect. `updateTenantAction` revalidates only superadmin paths (`:310-312`) and returns `{ success: true, data }` (`:315`) — no menu revalidation today. **Adding menu revalidation is NET-NEW to both.**
- `brandingUpdateSchema` + `updateTenantBrandingForAdminAction` (`tenants.ts:319-358`) is gated only by `verifyTenantAdmin` — **must NOT gain the new fields** (would let a tenant admin attach HTML, violating D2).
- `tenantSchema` is the single Zod schema (`tenants-service.ts:30-110`). Migration pattern: `supabase/migrations/<14-digit UTC>_*.sql` with `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ...` + `COMMENT ON COLUMN` (e.g. `20260412000001_qr_handoff_enabled.sql`). The `hero_design` DDL is NOT in the migrations folder — **verify live schema with `list_tables` before authoring the migration.**

### Branding exposure — verified
- `generateBrandingCSS(branding)` (`branding-utils.ts:216-261`) returns a `React.CSSProperties` of **42 `--brand-*` vars** (full list in §6). It is **NOT mounted on the menu route today** — only on `src/app/[tenant]/order/qr/[clientOrderId]/page.tsx:119` and `src/components/superadmin/enhanced-tenant-form.tsx:554`. `menu-client.tsx` consumes branding only as a JS object via inline `style={{...}}`. So `--brand-*` does not exist in the menu DOM and we mount it scoped to the custom wrappers only.

### Security baseline — verified
- **Zero CSP** anywhere (`next.config.ts:56-89` sets only `Cache-Control`; `src/middleware.ts` sets no security headers; no `vercel.json`/`_headers`/`meta http-equiv`).
- **No HTML sanitizer installed** (no `dompurify`/`isomorphic-dompurify`/`sanitize-html`/`xss`).
- Only two first-party `dangerouslySetInnerHTML`: `chart.tsx:95` and `meta-pixel-bootstrap.tsx:22` (env-gated Meta Pixel inline `<script>` in `<head>` via `layout.tsx:40` — proves inline scripts run unrestricted today; a CSP must not break it when `NEXT_PUBLIC_META_PIXEL_ID` is set).
- Injection-guard precedent (value-level, regex-only, insufficient for free-form HTML): `hero-block-schemas.ts:10-34` (`cssColorString`/`safeString`/`safeUrl`), `branding-utils.ts:414` `sanitizeCSSColor`. `next/image` remote allowlist: `images.unsplash.com`, `res.cloudinary.com`, `via.placeholder.com` (`next.config.ts`); raw `<img>` bypasses it.
- External runtime origins in use: Mapbox (`api.mapbox.com` CSS in `layout.tsx:37`, GL tiles/events `*.mapbox.com`/`events.mapbox.com`), Cloudinary (`api.cloudinary.com` upload XHR, `res.cloudinary.com` images), Nominatim (`nominatim.openstreetmap.org`), Sentry (tunneled through `/monitoring` per `next.config.ts:113`, plus `*.ingest.sentry.io`), Convex (`*.convex.cloud` over WSS), Facebook (`connect.facebook.net` loader, `www.facebook.com/tr` pixel img + OAuth frame).

### Test setup — verified
- Jest 30 (`jest.config.ts`), jsdom, alias `@/`→`src/`, tests in `tests/unit/{actions,api,components,hooks,lib}`. `jest.setup.js` mocks `@supabase/ssr`, `next/headers`, `next/cache` (`revalidatePath`/`revalidateTag`), `@upstash/redis`, `uuid`. Template: `tests/unit/hero-block-schemas.test.ts`. Run single: `npm run test -- --testPathPattern="custom-header"`. `npm run lint` must pass (Vercel deploy fails on lint errors). TypeScript strict.

---

## 1. Architecture overview

Two independent injection points in `menu-client.tsx`, each behind its own undefined-safe gate, each wrapped in its own error boundary, each with its own fallback. The custom HTML is sanitized (DOMPurify) on write AND on render, rendered via `dangerouslySetInnerHTML` into a scoped wrapper that carries the `--brand-*` vars. The HEADER wrapper additionally hosts a React portal that grafts the platform-owned `<CartTriggerButton>` into a `data-wn-cart-mount` marker inside the tenant HTML. A CSP (Report-Only first, then enforcing) is added in `middleware.ts` as a runtime backstop.

```
menu-client.tsx
├─ announcement banner (UNCHANGED, above header)
├─ HEADER region @ ~:452 (replaces inline <header>)
│   customHeaderEnabled ?
│     <CustomRegionBoundary region="header" key={headerHtml} fallback={<DefaultHeader/>}>
│       <CustomHeader html brandingStyle cartTrigger={<CartTriggerButton/>} fallback={<DefaultHeader/>}/>
│         → sanitize → dangerouslySetInnerHTML into sticky wrapper(style=brandingStyle)
│         → useLayoutEffect: querySelector('[data-wn-cart-mount]')
│         → createPortal(<CartTriggerButton/>, marker)   // marker missing → render fallback
│     </CustomRegionBoundary>
│   : <DefaultHeader/>
├─ HERO region @ ~:597 (inside existing IIFE, FIRST branch)
│   customHeroEnabled ?
│     <CustomRegionBoundary region="hero" key={heroHtml} fallback={renderDefaultHero(tenant)}>
│       <CustomHero html brandingStyle/>   // sanitize → dangerouslySetInnerHTML; NO portal
│     </CustomRegionBoundary>
│   : renderDefaultHero(tenant)            // existing IIFE: BlockHeroRenderer | null
├─ <main> ... MenuLayout (UNCHANGED; legacy/text hero live here, untouched)
└─ <CartDrawer/> sibling (UNCHANGED; portals to document.body)
```

### 1a. Header gate + boundary (replaces inline `<header>` at `menu-client.tsx:452-528`)

```tsx
{customHeaderEnabled ? (
  <CustomRegionBoundary region="header" key={tenant!.custom_header_html as string} fallback={<DefaultHeader {...defaultHeaderProps} />}>
    <CustomHeader
      html={tenant!.custom_header_html as string}
      brandingStyle={brandingStyle}
      cartTrigger={<CartTriggerButton onOpen={() => setIsCartOpen(true)} badgeBg={branding.menuCartBadgeBackground} badgeText={branding.menuCartBadgeText} iconColor={branding.textSecondary} />}
      fallback={<DefaultHeader {...defaultHeaderProps} />}
    />
  </CustomRegionBoundary>
) : (
  <DefaultHeader {...defaultHeaderProps} />
)}
```

Header gate (undefined-safe; `=== true` so `undefined`/`null`/`false` fall through):
```ts
const customHeaderEnabled =
  tenant?.custom_header_enabled === true &&
  typeof tenant?.custom_header_html === 'string' &&
  tenant.custom_header_html.trim().length > 0
```
The announcement banner (`:441-451`) stays above this boundary, unchanged.

### 1b. Hero gate + boundary (inside the IIFE at `menu-client.tsx:597-604`, as the FIRST branch)

```tsx
{(() => {
  if (customHeroEnabled) {
    return (
      <CustomRegionBoundary region="hero" key={tenant!.custom_hero_html as string} fallback={renderDefaultHero(tenant)}>
        <CustomHero html={tenant!.custom_hero_html as string} brandingStyle={brandingStyle} />
      </CustomRegionBoundary>
    )
  }
  return renderDefaultHero(tenant)   // existing selection extracted to a pure helper
})()}
```

Hero gate:
```ts
const customHeroEnabled =
  tenant?.custom_hero_enabled === true &&
  typeof tenant?.custom_hero_html === 'string' &&
  tenant.custom_hero_html.trim().length > 0
```

**`renderDefaultHero(tenant)` is the existing IIFE body, extracted verbatim into a pure helper so both the "not enabled" path and the error fallback share one source of truth:**
```ts
function renderDefaultHero(tenant: Tenant | null): React.ReactNode {
  const heroDesign = tenant?.hero_design as Record<string, unknown> | null
  const isBlockDesign = heroDesign && heroDesign.version === 4
  if (tenant?.hero_section_enabled !== false && heroDesign && isBlockDesign) {
    return <BlockHeroRenderer design={heroDesign as unknown as HeroBlockDesign} />
  }
  return null
}
```
The top-level hero only ever produces block-hero-or-null; the legacy `HeroRenderer`/text hero inside `LayoutDefault` (`<main>`) are reached only when the top-level renders nothing and are **untouched**. The `<main>` className IIFE at `:606-610` (which also reads `hero_design`/`layoutMode`) is left as-is — custom hero does not change page padding logic (acceptable; the custom hero renders above `<main>` like the block hero).

---

## 2. Component decomposition

Five units under `src/components/customer/custom-chrome/`. All are client components (parent `MenuClient` is `'use client'`).

### 2.1 `<CustomHeader>` — sanitized header renderer + cart portal host
**File:** `src/components/customer/custom-chrome/custom-header.tsx`
```ts
interface CustomHeaderProps {
  html: string                  // raw tenant HTML; sanitized internally before render
  brandingStyle: React.CSSProperties  // generateBrandingCSS(branding) → --brand-* vars on the wrapper
  cartTrigger: React.ReactNode  // <CartTriggerButton/> portaled into the marker
  fallback: React.ReactNode     // <DefaultHeader/> — rendered if the cart marker is missing at runtime
}
```
Behavior (full flow §3): sanitize `html` (memoized on `html`); render `<div ref={containerRef} data-wn-custom-header className="sticky top-0 z-50 w-full" style={brandingStyle} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />`; in a layout effect find `[data-wn-cart-mount]` and `createPortal(cartTrigger, marker)`; if no marker, render `fallback`. The `sticky top-0 z-50 w-full` is the ONE structural class the platform owns (cart accessibility parity with the default sticky header); everything inside is tenant-defined.

### 2.2 `<CustomHero>` — sanitized hero renderer (no portal)
**File:** `src/components/customer/custom-chrome/custom-hero.tsx`
```ts
interface CustomHeroProps { html: string; brandingStyle: React.CSSProperties }
```
Sanitizes `html` (memoized), renders `<div data-wn-custom-hero style={brandingStyle} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />`. No effect, no portal — pure look.

### 2.3 `<CartTriggerButton>` — first-party reactive trigger + badge (CANONICAL: reads `useCart()` internally)
**File:** `src/components/customer/custom-chrome/cart-trigger-button.tsx` — `'use client'`
```ts
interface CartTriggerButtonProps {
  onOpen: () => void   // () => setIsCartOpen(true)
  badgeBg: string      // branding.menuCartBadgeBackground
  badgeText: string    // branding.menuCartBadgeText
  iconColor?: string   // branding.textSecondary; defaults to currentColor so it inherits header text color
}
```
**`item_count` is NOT a prop — it is read inside via `const { item_count } = useCart()`.** (Resolves the 01↔02 conflict in favor of internal `useCart()`; see §15.) Safe because `CartProvider` is app-wide and the portaled node is logically a React child of `<CustomHeader>`, hence inside the provider; it re-renders on every context change independent of the host's render graph. DOM output is verbatim parity with `menu-client.tsx:502-519` plus a11y additions:
```tsx
'use client'
export function CartTriggerButton({ onOpen, badgeBg, badgeText, iconColor }: CartTriggerButtonProps) {
  const { item_count } = useCart()
  const display = item_count > 99 ? '99+' : String(item_count)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={item_count > 0 ? `Open cart, ${item_count} ${item_count === 1 ? 'item' : 'items'}` : 'Open cart'}
      aria-haspopup="dialog"
      className="relative p-2 transition-colors hover:opacity-80"
      style={{ color: iconColor ?? 'currentColor' }}
    >
      <span className="text-xl" aria-hidden="true">🛒</span>
      {item_count > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
          style={{ backgroundColor: badgeBg, color: badgeText }}
          aria-hidden="true"
        >
          {display}
        </span>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {item_count === 0 ? 'Cart empty' : `${item_count} ${item_count === 1 ? 'item' : 'items'} in cart`}
      </span>
    </button>
  )
}
```
`type="button"` so it never submits a stray tenant `<form>` (forms are forbidden by the sanitizer anyway). Badge counts bundles via the same `item_count` path as the default header.

### 2.4 `<DefaultHeader>` — verbatim extraction of the inline `<header>` (`menu-client.tsx:452-528`)
**File:** `src/components/customer/custom-chrome/default-header.tsx`
```ts
interface DefaultHeaderProps {
  tenant: Tenant | null
  tenantSlug: string
  branding: BrandingColors
  itemCount: number          // item_count
  onOpenCart: () => void     // () => setIsCartOpen(true)
  isBrandAdmin: boolean
  onEditMainHeader: () => void  // openBrandingEditor('main_header')
  onEditCartBadge: () => void   // openBrandingEditor('cart_badge')
}
```
Body is the current `<header>...</header>` with closures replaced by props (`branding.*` stay, `tenant?.logo_url`/`tenant?.name` stay, cart `<button>` calls `onOpenCart`, the two `AdminEditPencil` call `onEditMainHeader`/`onEditCartBadge`). `OptimizedImage` import moves with it. **`AdminEditPencil` move:** it is currently local at `menu-client.tsx:58-72` and used only inside the header region — extract it to `src/components/customer/custom-chrome/admin-edit-pencil.tsx` and import it from both `default-header.tsx` and `menu-client.tsx` (a grep confirms the only header-region uses; if any non-header use exists, keep the shared module). This is the only permitted refactor beyond the extraction. `defaultHeaderProps` (§1a) is this prop bag assembled once in `MenuClient`.

### 2.5 `<CustomRegionBoundary>` — class error boundary (one instance per region)
**File:** `src/components/customer/custom-chrome/custom-region-boundary.tsx`
```ts
interface CustomRegionBoundaryProps {
  fallback: React.ReactNode   // header: <DefaultHeader/>; hero: renderDefaultHero(tenant)
  region?: 'header' | 'hero'  // logging/telemetry only
  children: React.ReactNode
}
interface CustomRegionBoundaryState { hasError: boolean }
```
`getDerivedStateFromError() => { hasError: true }`; `componentDidCatch(err, info)` logs `[custom-chrome:${region}] render error, falling back` and may fire analytics; `render()` returns `hasError ? fallback : children`. Independent instances isolate header vs hero failures. **Keyed by the html string** in JSX so a changed/fixed HTML remounts the boundary (fresh `hasError: false`) and retries.

### 2.6 Sanitizer module (owned at §4)
**File:** `src/lib/sanitize-chrome-html.ts` — `export function sanitizeChromeHtml(dirty: string): string` (pure; isomorphic). Consumed by `<CustomHeader>`/`<CustomHero>` (render), the save action (write), and the form preview.

---

## 3. Cart contract (the load-bearing mechanism)

### 3.1 Marker contract
- **Namespace:** all platform markers use `data-wn-*` (`wn` = WebNegosyo). The sanitizer MUST whitelist `data-wn-cart-mount` and all `data-wn-*` (do not strip as "unknown attributes"), MUST preserve the element carrying it, and MUST NOT inject content into it.
- **REQUIRED `data-wn-cart-mount` (header only):** exactly one element. Cardinality: zero → fail closed (§3.4); more than one → only the **first in document order** receives the cart, the rest stay empty; save-time validation rejects ≠1 (§4.4). Put it on a `<div>`/`<span>` (NOT `<a>`/`<button>` — the portaled `<button>` inside would be invalid nested-interactive HTML; save-time SHOULD reject/warn). Leave it **empty** (the platform appends the portal child; if the tenant fills it, content stays alongside the portaled button — save-time SHOULD warn). The tenant positions the cart by placing this element where they want it; the platform injects only the button.
- **Why the tenant's own button can't be the trigger:** D1 strips `on*` and `<script>`, so any tenant `<button>` is inert. The platform-portaled button is the only path to a working cart.
- **OPTIONAL slots `data-wn-logo` / `data-wn-store-name` (0 or 1, first-match):** the platform may portal the tenant logo (`<OptimizedImage>` of `tenant.logo_url`, else initial-letter avatar) / store name (`tenant.name || tenantSlug.replace(/-/g,' ')`) into them. **Non-load-bearing** — absence never triggers fail-closed; only `data-wn-cart-mount`'s absence does. **Slots are OUT OF SCOPE for Phase 3** (documented, reserved; reuse the same multi-portal mechanism in §3.6 when shipped). Phase 3 ships cart-only; tenants hard-code logo/name in their HTML.

### 3.2 Sanitize → render
Inside `<CustomHeader>` / `<CustomHero>`: `const sanitizedHtml = useMemo(() => sanitizeChromeHtml(html), [html])` — re-runs only when the tenant string changes, not on cart/badge re-renders. Rendered via `dangerouslySetInnerHTML` into a ref'd container.

### 3.3 Locate marker + portal (React 19 timing)
```ts
const containerRef = useRef<HTMLDivElement>(null)
const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
const [markerMissing, setMarkerMissing] = useState(false)
useIsomorphicLayoutEffect(() => {
  const root = containerRef.current
  if (!root) return
  const el = root.querySelector<HTMLElement>('[data-wn-cart-mount]')
  setMountNode(el)
  setMarkerMissing(!el)
  return () => { setMountNode(null) }
}, [sanitizedHtml])
```
`dangerouslySetInnerHTML` populates `innerHTML` during commit; `useLayoutEffect`/`useEffect` run after commit, so the marker exists when `querySelector` runs. Use a `useIsomorphicLayoutEffect` shim (`= typeof window !== 'undefined' ? useLayoutEffect : useEffect`) to mount the portal before paint with no SSR warning and no marker-less flash. Then render:
```tsx
return (
  <>
    <div ref={containerRef} data-wn-custom-header className="sticky top-0 z-50 w-full" style={brandingStyle} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
    {markerMissing ? fallback : (mountNode && createPortal(cartTrigger, mountNode))}
  </>
)
```
`cartTrigger` (the `<CartTriggerButton>`) is created in `MenuClient`'s render scope, but reactivity comes from its own internal `useCart()` (§2.3), so the badge updates on every cart mutation regardless of the host's render graph. Portaling into a descendant of a `dangerouslySetInnerHTML` node is the supported pattern: React owns the (empty) marker's portal children; the browser owns the surrounding innerHTML; they don't fight.

### 3.4 Marker missing → fail closed to `<DefaultHeader>`
When the effect finds no marker, `markerMissing = true` → `<CustomHeader>` renders its `fallback` (the `<DefaultHeader>`) on the next render. No floating button. The cart is therefore reachable in EVERY path: valid marker → portaled trigger; missing marker → `<DefaultHeader>`; header throws → boundary → `<DefaultHeader>`; disabled → `<DefaultHeader>`. Save-time `.refine` (§4.4) is the primary guard; this runtime fail-closed is defense in depth (covers DB-direct edits). `useLayoutEffect` makes the swap pre-paint (no flash).

### 3.5 Re-portal / teardown / StrictMode
- **Re-portal on HTML change:** effect dep is `sanitizedHtml`. On change: cleanup `setMountNode(null)` unmounts old portal → React commits new innerHTML → re-run effect finds new marker → re-mounts. No dangling node, no double-mount.
- **Teardown:** on unmount React removes the portal (`<CartTriggerButton>` + listeners) and the container with its innerHTML. Nothing manual.
- **StrictMode:** the effect is idempotent (derives state purely from current DOM each run; cleanup sets `mountNode` null). Double-invoke yields exactly one mounted portal, no duplicate buttons/listeners. `sanitizeChromeHtml` MUST be pure (§4) so its `useMemo` double-call is safe.

### 3.6 Multi-marker (reserved, slots phase only)
Same effect queries all three markers; `createPortal`s into each present node independently; `markerMissing` driven ONLY by the cart marker. Not implemented in Phase 3.

### 3.7 What stays UNCHANGED in `MenuClient` (why the cart still works)
`isCartOpen`/`setIsCartOpen` state (`:93`), the `setTenantContext` mount effect (`:98-102`), the `<CartDrawer>` sibling (`:699-710`, portals to `document.body` — never inside header DOM), all add/remove/qty/checkout logic inside `<CartDrawer>` (consumes `useCart` directly), and `addItem` threaded to product cards — all byte-for-byte unchanged. The ONLY change to cart wiring is *where the trigger renders* (portaled into custom HTML vs inline in `<DefaultHeader>`); both call the same `setIsCartOpen` and the same `<CartDrawer>`/`useCart`. This is the architectural guarantee.

---

## 4. Sanitizer + write/render defense in depth

### 4.0 No iframe
Iframe sandbox is rejected: the cart trigger must be a live React node portaled INTO a marker inside the custom header; an `<iframe sandbox>` is a separate document/React tree that `createPortal` cannot reach and across which the `item_count`/`setIsCartOpen` closures can't drive a button (would need `postMessage` RPC, breaking the platform-owned-trigger guarantee). Defense = strict allowlist sanitization on write AND render, backstopped by a CSP. (Note: the superadmin *preview* MAY use an `<iframe sandbox>` since it has no live cart — §7.5.)

### 4.1 Dependency
Add **`isomorphic-dompurify`** (NOT bare `dompurify`). One `sanitizeChromeHtml()` runs in both the server action (write, Node — no `window`) and the client component (render, browser); `isomorphic-dompurify` ships DOMPurify + jsdom and auto-selects the right `window`. Pin a current version; keep patched (DOMPurify ships frequent mXSS fixes). Hand-rolling is rejected (the regex precedents are too weak for free-form markup).

### 4.2 Module: `src/lib/sanitize-chrome-html.ts`
```ts
import DOMPurify from 'isomorphic-dompurify'

const CHROME_PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'div','span','header','nav','section','article','aside','footer','main','figure','figcaption',
    'h1','h2','h3','h4','h5','h6',
    'p','a','b','strong','i','em','u','s','small','mark','br','hr','blockquote','address','time','abbr',
    'ul','ol','li','dl','dt','dd',
    'img','picture','source',
    'svg','path','g','circle','rect','line','polyline','polygon','ellipse','defs','linearGradient','radialGradient','stop','use','symbol','title','desc',
    'button',           // DECORATIVE only (no behavior; cart is portaled)
    'style',            // CSS for look (neutralized in §4.3)
  ],
  ALLOWED_ATTR: [
    'class','id','style','title','role','lang','dir',
    'href','target','rel',
    'src','srcset','sizes','alt','width','height','loading','decoding','media','type','poster',
    'viewBox','xmlns','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','d','cx','cy','r','x','y','x1','y1','x2','y2','points','rx','ry','transform','gradientUnits','offset','stop-color','stop-opacity','opacity','preserveAspectRatio',
    'aria-hidden','aria-label','aria-labelledby','aria-describedby','tabindex',
  ],
  FORBID_TAGS: [
    'script','iframe','object','embed','form','input','textarea','select','option',
    'link','meta','base','template','noscript','frame','frameset','applet',
    'audio','video','track','math','foreignObject','animate','animateTransform','set',
  ],
  FORBID_ATTR: [    // belt-and-suspenders; DOMPurify already strips ALL on* by default
    'onerror','onload','onclick','onmouseover','onfocus','onanimationstart','onanimationend','ontoggle','onbegin','onpointerover',
    'formaction','action','background','ping','srcdoc','xlink:href',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  ADD_DATA_URI_TAGS: ['img','source'],   // paired with §4.3 hook (data:image-only re-check)
  ADD_ATTR: ['data-wn-cart-mount','data-wn-custom-header','data-wn-custom-hero'],  // keep markers
  SANITIZE_DOM: true,
  FORBID_CONTENTS: ['script','style'],
  WHOLE_DOCUMENT: false,
  RETURN_TRUSTED_TYPE: false,
  USE_PROFILES: { html: true, svg: true },
} as const
```
- `on*` stripped by DOMPurify default (FORBID_ATTR is documentation + guard). `javascript:`/`vbscript:` killed by `ALLOWED_URI_REGEXP`. `data:` killed except raster `data:image` (enforced by the §4.3 hook, not `ADD_DATA_URI_TAGS` alone — which can be too permissive). `form`/inputs forbidden (no phishing/auto-submit). `button` allowed decorative only.

### 4.3 Hooks (load-bearing extra checks; install once at module load, idempotent)
```ts
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i
const SAFE_URL_RE   = /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i
const CSS_KILL = /(expression\s*\(|url\s*\(\s*['"]?\s*(javascript|vbscript|data:text)|behavior\s*:|-moz-binding|@import|javascript:|vbscript:)/gi

DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'style' && node.textContent && CSS_KILL.test(node.textContent)) {
    node.textContent = node.textContent.replace(CSS_KILL, '/*blocked*/')
  }
})
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  for (const attr of ['src','href','poster']) {
    const v = node.getAttribute?.(attr); if (!v) continue
    const t = v.trim()
    if (!DATA_IMAGE_RE.test(t) && !SAFE_URL_RE.test(t)) node.removeAttribute(attr)
  }
  const srcset = node.getAttribute?.('srcset')
  if (srcset && /(^|[\s,])data:(?!image\/(png|jpe?g|gif|webp);base64)/i.test(srcset)) node.removeAttribute('srcset')
  if (node.tagName === 'A' && node.getAttribute('target')) node.setAttribute('rel','noopener noreferrer')
  const style = node.getAttribute?.('style')
  if (style && CSS_KILL.test(style)) node.setAttribute('style', style.replace(CSS_KILL, ''))
})

export function sanitizeChromeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, CHROME_PURIFY_CONFIG)
}
```
CSS scrub removes `expression()`, `url(javascript:|vbscript:|data:text...)`, `behavior:`/`-moz-binding`, `@import` from both inline `style` and `<style>` text; `url()` to images preserved. `<style>` is NOT auto-scoped — style-bleed onto the page is a UX/trust residual (superadmin-authored per D2), bounded by `CSS_KILL` + CSP for the *security* line; optional selector-scoping is a nicety, not required. CSS-exfil via attribute selectors is N/A (no `input`/`textarea`/`form` in the region; real inputs live on other routes).

### 4.4 Write path: sanitize-on-write + store sanitized + marker `.refine`
In the superadmin save action (§5.4), after `verifySuperadmin()` and `tenantSchema.parse(input)`:
```
sanitizedHeader = parsed.custom_header_html ? sanitizeChromeHtml(parsed.custom_header_html) : null
sanitizedHero   = parsed.custom_hero_html   ? sanitizeChromeHtml(parsed.custom_hero_html)   : null
// post-sanitize marker re-check: if header enabled and the marker did NOT survive → return friendly error
payload.custom_header_html    = sanitizedHeader
payload.custom_header_enabled = parsed.custom_header_enabled ?? false
payload.custom_hero_html      = sanitizedHero
payload.custom_hero_enabled   = parsed.custom_hero_enabled ?? false
```
**Store the SANITIZED string** (resolves 01/04↔03; store-sanitized wins — §15): the editor/preview round-trips exactly what renders, stored attack surface is minimal, and render still re-sanitizes. Zod (`tenantSchema`, §5.3) enforces length cap + exactly-one `data-wn-cart-mount` (only when header enabled with non-empty HTML, so drafts with the switch OFF can be saved). The post-sanitize re-check is belt-and-suspenders (sanitizer whitelists the marker, but catches the case where the marker sat inside a stripped element).

### 4.5 Render path: re-sanitize
`<CustomHeader>`/`<CustomHero>` call `sanitizeChromeHtml()` again, memoized on the raw string, immediately before `dangerouslySetInnerHTML` (§3.2). Covers out-of-band DB edits / restores / config rollbacks. Idempotent. Three layers total (write + render + CSP).

---

## 5. DB / types / load / save

### 5.1 Migration (pre-flight `list_tables` on `tenants` FIRST — `hero_design` DDL is not in the folder)
**File:** `supabase/migrations/<14-digit UTC>_custom_header_hero_html.sql` (must sort AFTER `20260412000001_qr_handoff_enabled.sql`).
```sql
-- Custom hero/header attacher: superadmin-attached HTML defining the LOOK of the
-- menu header and hero, per-tenant. LOOK-ONLY (scripts stripped at render); the cart
-- is platform-owned via a React portal. Two independent fields + toggles; independent fallback.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS custom_header_html    text,
  ADD COLUMN IF NOT EXISTS custom_header_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_hero_html      text,
  ADD COLUMN IF NOT EXISTS custom_hero_enabled   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.custom_header_html IS
  'Superadmin-attached HTML defining the menu header LOOK. Sanitized on write and render (scripts/on*/javascript:/non-image data: stripped). MUST contain exactly one element with data-wn-cart-mount; the platform portals the live cart trigger into it. NULL = use default header.';
COMMENT ON COLUMN tenants.custom_header_enabled IS
  'Render gate for custom_header_html. When false (default), the default header renders. A broken/empty value also falls back to the default header.';
COMMENT ON COLUMN tenants.custom_hero_html IS
  'Superadmin-attached HTML defining the menu hero LOOK. Sanitized on write and render. No cart marker required (hero has no interactivity). NULL = use default hero.';
COMMENT ON COLUMN tenants.custom_hero_enabled IS
  'Render gate for custom_hero_html. When false (default), the existing hero selection (hero_design v4 / legacy / text / none) renders. Broken/empty value also falls back.';
```
Booleans `NOT NULL DEFAULT false` (every existing row is "off", no backfill). HTML nullable `text` ("never attached" vs "attached but empty" distinguishable). No SQL CHECK for the marker/length — enforced in Zod (friendlier errors) + render fallback. No RLS change.

### 5.2 `Tenant` interface — `src/types/database.ts` (~:119, near `hero_section_enabled`)
```ts
  // Custom hero/header attacher (superadmin-attached HTML; LOOK-only)
  custom_header_html?: string | null;
  custom_header_enabled?: boolean;
  custom_hero_html?: string | null;
  custom_hero_enabled?: boolean;
```
Hand-maintained (NOT generated). Optional + nullable so legacy rows / partial selects compile; the index signature `[key: string]: unknown` at `:143` would compile without these but explicit fields give type-safe gates + autocomplete.

### 5.3 `supabase.ts` tenants blocks — `src/types/supabase.ts` (THREE blocks)
- **Row** (after `hero_section_enabled: boolean` at `:1280`): non-optional booleans, nullable strings.
- **Insert** (after `:1401`) and **Update** (after `:1522`): all four optional.
```ts
// Row:
          custom_header_html: string | null
          custom_header_enabled: boolean
          custom_hero_html: string | null
          custom_hero_enabled: boolean
// Insert & Update (each):
          custom_header_html?: string | null
          custom_header_enabled?: boolean
          custom_hero_html?: string | null
          custom_hero_enabled?: boolean
```
**Recommended:** after applying the migration to a dev/branch DB, regenerate via `mcp__supabase__generate_typescript_types` and replace the file (guarantees all three blocks stay consistent). **Fallback:** hand-edit all three exactly as above; then `npm run build` type-checks the action payloads to catch a missed block.

### 5.4 Load: add 4 columns to the menu select allowlist — `menu-server.tsx` (~:23)
```
      hero_title, hero_description, hero_title_color, hero_description_color, hero_design, hero_section_enabled,
      custom_header_html, custom_header_enabled, custom_hero_html, custom_hero_enabled,
```
**This is the single most likely "it doesn't work" bug** — without it all gates evaluate false. **No `page.tsx` change** (whole `tenant` already passed) and **no `MenuClientProps` change** (`tenant: Tenant | null` already covers it). The render-side derivations (`brandingStyle`, gates, `cartTrigger`, `defaultHeaderProps`) are computed INSIDE `MenuClient`.

### 5.5 Save: extend the ACTIONS (live path), keep service in sync, add menu revalidation
- Extend `tenantSchema` (§5.3 Zod below) + add the four fields to **all four payload sites**: `tenants.ts` `insertPayload` (`:73-150`) & `updatePayload` (`:217-294`), and `tenants-service.ts` `createTenantSupabase`/`updateTenantSupabase` payloads (sync to avoid drift). Lines are trivial: `custom_header_html: sanitizedHeader`, `custom_header_enabled: parsed.custom_header_enabled ?? false`, etc.
- **Sanitize-on-write** inside the actions (§4.4), storing sanitized.
- **Role gate already satisfied** by `verifySuperadmin()`. **Do NOT** add the fields to `brandingUpdateSchema`/`updateTenantBrandingForAdminAction` (D2).
- **NET-NEW menu revalidation** in BOTH actions:
  - `createTenantAction`: add `revalidatePath(\`/${tenant.slug}/menu\`, 'layout')` + `await invalidateTenantCache(tenant.slug, tenant.id)` **before** the `redirect()` (`:183`).
  - `updateTenantAction`: add `revalidatePath(\`/${data.slug}/menu\`, 'layout')` + `await invalidateTenantCache(data.slug, data.id)` after the update succeeds (`:303`), before returning `{ success: true, data }`.
  - `import { invalidateTenantCache } from '@/lib/cache'`. (Also fixes a latent staleness gap for hero/branding edits.)

### 5.6 Zod — new module + compose into `tenantSchema`
**New file `src/lib/custom-chrome-schemas.ts`** (mirrors `hero-block-schemas.ts`; independently unit-testable):
```ts
import { z } from 'zod'
const MAX_CHROME_HTML = 100_000
export function countCartMountMarkers(html: string): number {
  return (html.match(/data-wn-cart-mount\b/gi) ?? []).length
}
export const chromeHtmlField = z.string().max(MAX_CHROME_HTML, { message: 'HTML is too large (max ~100 KB).' }).optional().or(z.literal('')).optional()
```
In `tenants-service.ts`, add to the `z.object({...})` (`:30-110`):
```ts
  // Custom hero/header attacher (superadmin-only)
  custom_header_enabled: z.boolean().default(false),
  custom_header_html: z.string().max(100_000).optional().or(z.literal('')).optional(),
  custom_hero_enabled: z.boolean().default(false),
  custom_hero_html: z.string().max(100_000).optional().or(z.literal('')).optional(),
```
Then wrap with `.superRefine` (does NOT change the inferred type, so `TenantInput`/actions/form `input` are unaffected besides the 4 keys):
```ts
export const tenantSchema = baseTenantObject.superRefine((val, ctx) => {
  const headerHtml = (val.custom_header_html ?? '').trim()
  if (val.custom_header_enabled && headerHtml.length > 0) {
    const n = countCartMountMarkers(headerHtml)
    if (n !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['custom_header_html'],
      message: n === 0
        ? 'Header HTML must contain exactly one element with data-wn-cart-mount so the cart button can be placed.'
        : `Header HTML must contain exactly one data-wn-cart-mount marker (found ${n}).` })
  }
})
```
**No `[<>]` rejection** (unlike `safeString`) — HTML needs angle brackets; content safety is the sanitizer's job. Zod validates metadata only (length + marker invariant). Marker rule keyed on `enabled` so drafts (switch OFF) save freely. The error surfaces in the form's existing `toast.error(\`Validation error: ${e.message}\`)` path (`tenants.ts:53`).

---

## 6. Branding exposure (`--brand-*` scoped to wrappers)
`MenuClient` computes `const brandingStyle = useMemo(() => generateBrandingCSS(branding), [branding])` (the 42-var `React.CSSProperties` from `branding-utils.ts:216-261`). `<CustomHeader>`/`<CustomHero>` apply `style={brandingStyle}` on their outermost `<div>` (the same node hosting `dangerouslySetInnerHTML`). CSS custom properties inherit, so tenant HTML inside can reference `var(--brand-header)`, `var(--brand-menu-cart-badge-text)`, etc. Values originate from `getTenantBranding(tenant)` which passes color fields through `sanitizeCSSColor`, so var *values* are color-safe (tenant CSS *using* them is still subject to the §4 CSS scrub). **No global mount** — we deliberately do NOT wrap `<main>`/page root, keeping the change additive, scoped, and unable to cascade onto the default header/menu cards (which read branding via JS, not vars).

The 42 vars available to custom HTML: `--brand-background`, `--brand-header`, `--brand-header-font`, `--brand-cards`, `--brand-cards-border`, `--brand-card-title`, `--brand-card-price`, `--brand-card-description`, `--brand-modal-background/-title/-price/-description`, `--brand-checkout-modal-background/-title/-description/-price/-button/-button-text/-border`, `--brand-button-primary`, `--brand-button-primary-text`, `--brand-button-secondary`, `--brand-button-secondary-text`, `--brand-text-primary/-secondary/-muted`, `--brand-menu-main-header-text`, `--brand-menu-main-header-subtitle`, `--brand-menu-category-header/-active/-inactive`, `--brand-menu-cart-badge-bg`, `--brand-menu-cart-badge-text`, `--brand-border`, `--brand-success/-warning/-error`, `--brand-link`, `--brand-shadow`, `--brand-primary/-secondary/-accent`.

---

## 7. Admin UX (superadmin form)

### 7.1 Placement
New section component `CustomChromeSection` in `tenant-form-wrapper.tsx`, rendered in the `<form>` (`:1404`) immediately after `<MenuEngineeringSection>` (`:1447`) and before `<FlashScreenFeatureSection>` (`:1453`). Uses the same `Card`/`CardHeader`/`CardTitle`/`Switch`/`Label`/`Separator` idiom as `MenuEngineeringSection` (`:632`). No new design system, no new dependency for the editor.

### 7.2 Form-state additions
Extend `TenantFormData` (`:30`), the `useState` initializer (`:1240`), and the `handleSubmit` `input` object (`:1307-1369`):
```ts
// TenantFormData:
  custom_header_enabled: boolean
  custom_header_html: string
  custom_hero_enabled: boolean
  custom_hero_html: string
// initializer:
  custom_header_enabled: tenant?.custom_header_enabled ?? false,
  custom_header_html: tenant?.custom_header_html || '',
  custom_hero_enabled: tenant?.custom_hero_enabled ?? false,
  custom_hero_html: tenant?.custom_hero_html || '',
// handleSubmit input:
  custom_header_enabled: formData.custom_header_enabled,
  custom_header_html: formData.custom_header_html || undefined,
  custom_hero_enabled: formData.custom_hero_enabled,
  custom_hero_html: formData.custom_hero_html || undefined,
```

### 7.3 Section structure (two parallel, independent sub-blocks: header, hero)
Each sub-block: (1) a `<Switch>` (`custom_header_enabled` / `custom_hero_enabled`); (2) a file `<input accept=".html,text/html">` that on change reads the file via `FileReader.readAsText` and sets the textarea value (D4 — the file never leaves the browser):
```tsx
const handleUpload = (file: File, set: (v: string) => void) => {
  const reader = new FileReader()
  reader.onload = () => set(typeof reader.result === 'string' ? reader.result : '')
  reader.readAsText(file)
}
```
(3) an editable `<textarea>` (`font-mono text-xs min-h-[240px]`, styled with the form's input classes; no code-editor dependency) — the source of truth, stays editable after upload and even when the switch is off (prepare HTML before enabling); (4) a live preview (§7.5); (5) inline advisory hints (§7.4). The two sub-blocks are fully independent (D3).

### 7.4 Advisory hints (client-side, non-blocking; server Zod is authoritative)
- **Missing cart marker (header only):** when `custom_header_html` non-empty and `!includes('data-wn-cart-mount')` — amber box: "Cart mount missing. Your header HTML must include exactly one element with `data-wn-cart-mount` (e.g. `<div data-wn-cart-mount></div>`) so the shopping cart button can be placed inside it. Without it, the default header will be used."
- **Too long:** > 100,000 chars — red: "Header HTML is too large (max ~100 KB)."
- **Enabled-but-empty:** switch on + textarea empty — blue: "Enabled but no HTML attached — the default header will render."
- **Scripts present (informational):** contains `<script` — amber: "Scripts are not allowed and will be removed automatically. This feature is look-only; the cart is provided by the platform."

### 7.5 Preview (sandboxed)
Render `sanitizeChromeHtml(value)` into a same-origin `<iframe sandbox="">` (no `allow-scripts` — hard second boundary in the admin context even if sanitization ever missed something) whose `srcDoc` wraps the sanitized HTML in a `<div>` with the `--brand-*` vars injected as inline style (so brand colors show). For the HEADER preview, drop a static non-functional 🛒 placeholder pill where `data-wn-cart-mount` is, so the superadmin sees where the cart will sit (the real cart only exists on the live menu via the portal). Debounce ~300 ms off the textarea. If the sanitizer is import-safe in the browser (it is — `isomorphic-dompurify`), run it client-side; otherwise call a tiny `previewSanitizeAction`. Surface the §3.1 marker rules as author help text.

---

## 8. Fallback rules (header and hero, independent)

| Condition | Header result | Hero result |
|---|---|---|
| Toggle OFF / `=== true` not met | `<DefaultHeader/>` | `renderDefaultHero(tenant)` |
| HTML null/empty/whitespace | `<DefaultHeader/>` (gate false) | `renderDefaultHero(tenant)` (gate false) |
| Custom enabled + valid (marker present, no throw) | portaled `<CartTriggerButton>` in sanitized HTML | sanitized hero HTML |
| Cart marker missing at runtime | fail closed → `<DefaultHeader/>` (§3.4) | N/A (hero has no marker) |
| Sanitize/render/portal throws | `<CustomRegionBoundary>` → `<DefaultHeader/>` | `<CustomRegionBoundary>` → `renderDefaultHero(tenant)` |
| Superadmin fixes & re-saves | boundary keyed by html string remounts (fresh `hasError:false`) and retries | same |

**Independence:** two separate `<CustomRegionBoundary>` instances; React boundaries catch only their own subtree, so a hero throw cannot unmount the header and vice versa (D3). The cart is reachable in EVERY header path (§3.4). Boundaries catch render/lifecycle/constructor errors, NOT async effect/event-handler errors; the only async risk (marker-missing in the effect) is handled by the `markerMissing` state-flag fallback, not the boundary. `createPortal` into a valid node does not throw; sanitizer exceptions happen in `useMemo` during render → caught by the boundary.

---

## 9. CSP backstop (NEW — none exists; Report-Only first)

Set in **`middleware.ts`** (so the per-request nonce can be interpolated; static `next.config.ts` headers can't hold a per-request nonce). Ship as **`Content-Security-Policy-Report-Only`** for ≥1 week, watch Sentry/console, then flip the header name to `Content-Security-Policy`. Apply globally (`/:path*`) — a backstop is only useful if uniform.

**`script-src`: per-request nonce + `'strict-dynamic'`, NOT `'unsafe-inline'`.** The only first-party inline `<script>` is the env-gated Meta Pixel (`meta-pixel-bootstrap.tsx`). Generate a nonce in middleware; if the Pixel is configured, add `nonce={nonce}` to its `<script>` (one-line change) — its injected `connect.facebook.net` loader is covered by `'strict-dynamic'`. If the Pixel env is unset (common), nothing inline renders. Hash is rejected (snippet interpolates `${pixelId}`); `'unsafe-inline'` is rejected (negates the backstop). Verify Next 15 reads CSP from the response header to nonce its own scripts (`x-nonce` pattern).

Exact policy (single-line `directive; directive; ...`; `{NONCE}` interpolated per request):
```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-{NONCE}' 'strict-dynamic' https://connect.facebook.net; style-src 'self' 'unsafe-inline' https://api.mapbox.com; img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://via.placeholder.com https://www.facebook.com https://*.mapbox.com; font-src 'self' data:; connect-src 'self' https://api.cloudinary.com https://api.mapbox.com https://events.mapbox.com https://nominatim.openstreetmap.org https://*.convex.cloud wss://*.convex.cloud https://connect.facebook.net https://*.ingest.sentry.io https://*.ingest.us.sentry.io; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' https://www.facebook.com; media-src 'self'; manifest-src 'self'; upgrade-insecure-requests
```
`style-src 'unsafe-inline'` is REQUIRED (the app uses massive inline `style={...}` incl. the `--brand-*` wrapper, Tailwind/Radix runtime styles, Mapbox CSS) and does NOT weaken script defense — style-XSS is already neutralized by §4.3 `CSS_KILL`. `worker-src/child-src blob:` keep Mapbox GL + Sentry Replay workers alive. Sentry is tunneled through `/monitoring` (same-origin, covered by `'self'`); the `*.ingest.sentry.io` entries are a safety net. Cloudinary uploads via direct XHR to `api.cloudinary.com` (no widget script) → covered by `connect-src`. During the Report-Only window, confirm no regression to Meta Pixel (when env set), Mapbox, Cloudinary upload, Sentry, Convex WSS, Facebook OAuth.

---

## 10. Threat model (summary)
Stored XSS (allowlist write+render + CSP nonce); mXSS (`SANITIZE_DOM`, `USE_PROFILES`, no `WHOLE_DOCUMENT`, keep DOMPurify patched, CSP backstop refuses the resulting un-nonced inline script); CSS exfil (`CSS_KILL` + no form fields + `img-src`/`default-src` constrain `url()`); clickjacking (`frame-ancestors 'none'`); reverse tabnabbing (hook adds `rel="noopener noreferrer"`); `data:` abuse (raster `data:image` only; SVG-as-data + inline `<svg>` script vectors blocked); SSRF (N/A — render is client-side; write-time sanitize never fetches URLs); phishing forms (`form`/`input` forbidden + `form-action 'self'`); cart hijack/break (platform-portaled trigger + marker `.refine` + `<DefaultHeader>` fallback — cart present in every path); DoS (Zod `.max(100_000)`). Trust note: D2 makes this a superadmin-authored surface — primary threat is accidental breakage + stored-payload/compromised-superadmin, both covered by sanitize-on-render + CSP. (The QR-handoff deferred-auth memory is unrelated.)

---

## 11. File-by-file plan (dependency order)

### Create
1. `src/lib/sanitize-chrome-html.ts` — `sanitizeChromeHtml()` (DOMPurify config §4.2 + hooks §4.3). Foundation for write/render/preview.
2. `src/lib/custom-chrome-schemas.ts` — `countCartMountMarkers()`, `chromeHtmlField`, marker-rule helper (§5.6).
3. `supabase/migrations/<ts>_custom_header_hero_html.sql` — 4 columns + comments (§5.1). Pre-flight `list_tables` first.
4. `src/components/customer/custom-chrome/admin-edit-pencil.tsx` — extracted `AdminEditPencil` (§2.4), imported by `default-header.tsx` and `menu-client.tsx`.
5. `src/components/customer/custom-chrome/default-header.tsx` — `<DefaultHeader>` verbatim extraction of `menu-client.tsx:452-528` (§2.4).
6. `src/components/customer/custom-chrome/cart-trigger-button.tsx` — `<CartTriggerButton>` (internal `useCart()`) (§2.3).
7. `src/components/customer/custom-chrome/custom-region-boundary.tsx` — `<CustomRegionBoundary>` (§2.5).
8. `src/components/customer/custom-chrome/custom-header.tsx` — `<CustomHeader>` (sanitize + portal lifecycle §3); imports #1, #6.
9. `src/components/customer/custom-chrome/custom-hero.tsx` — `<CustomHero>` (sanitize, no portal §2.2); imports #1.
10. `docs/custom-header-hero/examples/custom-header.example.html` — §13.1 starter.
11. `docs/custom-header-hero/examples/custom-hero.example.html` — §13.2 starter.
12. `docs/custom-header-hero/examples/README.md` — upload/enable/save/view instructions.
13. `tests/unit/lib/custom-chrome-schemas.test.ts` — marker/length cases (§14).
14. `tests/unit/lib/sanitize-chrome-html.test.ts` — attack-payload neutralization (§14).
15. `tests/unit/components/custom-header.test.tsx` — portal/cart/fallback assertions (§14).

### Modify
16. `src/types/database.ts` — 4 fields on `Tenant` (~:119) (§5.2).
17. `src/types/supabase.ts` — 4 fields × 3 blocks (Row :1280, Insert :1401, Update :1522) (§5.3); regenerate preferred.
18. `src/app/[tenant]/menu/menu-server.tsx` — add 4 columns to `.select` (~:23) (§5.4). **MANDATORY — without it the feature silently never renders.** No `page.tsx`/`MenuClientProps` change.
19. `src/lib/tenants-service.ts` — extend `tenantSchema` `z.object` + `.superRefine` (§5.6); add 4 fields to `createTenantSupabase`/`updateTenantSupabase` payloads (sync).
20. `src/actions/tenants.ts` — add 4 fields to `insertPayload` (:73) & `updatePayload` (:217); sanitize-on-write + post-sanitize marker re-check (§4.4); `revalidatePath('/<slug>/menu','layout')` + `invalidateTenantCache` in BOTH (create before redirect, update before return) (§5.5). **Do NOT** touch `brandingUpdateSchema`.
21. `src/components/superadmin/tenant-form-wrapper.tsx` — `CustomChromeSection` + `TenantFormData`/initializer/`input` additions (§7); render after `MenuEngineeringSection`.
22. `src/app/[tenant]/menu/menu-client.tsx` — remove inline `<header>` (use `<DefaultHeader>`); add header gate + boundary at `:452` (§1a); add custom-hero branch + `renderDefaultHero` helper at `:597` (§1b); compute `customHeaderEnabled`/`customHeroEnabled`/`brandingStyle`/`defaultHeaderProps`; move `AdminEditPencil` import. Verify lint: no unused imports after extraction (`OptimizedImage`, `Pencil` move to the new files).
23. `src/middleware.ts` — generate per-request nonce; set CSP header (Report-Only first) (§9).
24. `src/components/tracking/meta-pixel-bootstrap.tsx` — add `nonce` prop on the `<script>` (only if Pixel env used) (§9).
25. `package.json` / lockfile — add `isomorphic-dompurify` (§4.1).

---

## 12. Phased sequence → the six Phase-3 builders
Foundation (do before the six, or fold into the first builder that needs it): #1 sanitizer, #2 schemas, #25 dependency, #3 migration, #16/#17 types, #4 `AdminEditPencil`, #5 `<DefaultHeader>`.

- **(10) Hero Attacher:** #9 `<CustomHero>`; #22 hero branch + `renderDefaultHero` helper at `menu-client.tsx:597`; uses #1 sanitizer, #16/#17 types, #18 select column.
- **(11) Header Attacher:** #8 `<CustomHeader>` shell + #5 `<DefaultHeader>` + #4 `AdminEditPencil`; #22 header gate/boundary at `:452`; uses #1 sanitizer.
- **(12) Cart Mount/Hook:** #6 `<CartTriggerButton>` (internal `useCart()`); the portal `useLayoutEffect`/`useIsomorphicLayoutEffect` + marker logic inside #8 (§3).
- **(13) Sanitization/Sandbox:** #1 `sanitize-chrome-html.ts` (config + hooks); #23 CSP middleware + #24 nonce on Meta Pixel.
- **(14) Upload/Config + saving:** #18 select column; #2 schemas + #19 `tenantSchema`/service payloads; #20 actions (payloads + sanitize-on-write + revalidation); #21 superadmin `CustomChromeSection` (upload + editable textarea + preview).
- **(15) Fallback:** #7 `<CustomRegionBoundary>`; wire boundaries + `fallback` + `markerMissing` fail-closed + boundary `key` in #22 (§8).

Tests (#13–#15 above in §11) land alongside their builders; security attack list (§14) verified in Phase 4.

---

## 13. Example HTML (ship as docs; never imported/executed)

### 13.1 `examples/custom-header.example.html`
```html
<!--
  Custom Header example — LOOK ONLY.
  REQUIRED: exactly one element with data-wn-cart-mount. The platform portals the live,
  fully-functional cart button (open drawer + live item badge) INTO it. Leave it EMPTY.
  Do NOT add your own cart button, <script>, on* handlers, or javascript:/data: URLs — stripped.
  Use --brand-* CSS variables for tenant colors.
-->
<div style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 20px; background:var(--brand-header, #ffffff); color:var(--brand-header-font, #111111); border-bottom:1px solid var(--brand-border, #e5e7eb); font-family: ui-sans-serif, system-ui, sans-serif;">
  <div style="display:flex; align-items:center; gap:12px;">
    <span style="display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:9999px; background:var(--brand-primary, #c41e3a); color:var(--brand-button-primary-text, #ffffff); font-weight:700; font-size:18px;">★</span>
    <span style="font-size:20px; font-weight:800; letter-spacing:-0.01em;">Your Restaurant</span>
  </div>
  <!-- The cart goes HERE. Leave this element EMPTY; the platform injects the working cart trigger + live badge. -->
  <div data-wn-cart-mount aria-label="Shopping cart"></div>
</div>
```

### 13.2 `examples/custom-hero.example.html`
```html
<!--
  Custom Hero example — LOOK ONLY. No cart, no scripts, no interactivity. Renders above the menu.
  Use --brand-* variables for tenant colors. Raw <img> allowed; src constrained by the sanitizer.
-->
<section style="position:relative; overflow:hidden; padding:56px 24px; text-align:center; background:linear-gradient(135deg, var(--brand-primary, #c41e3a) 0%, var(--brand-secondary, #009246) 100%); color:var(--brand-button-primary-text, #ffffff); font-family: ui-sans-serif, system-ui, sans-serif;">
  <h1 style="margin:0 0 12px; font-size:40px; font-weight:900; letter-spacing:-0.02em;">Fresh. Fast. Yours.</h1>
  <p style="margin:0 auto; max-width:520px; font-size:18px; opacity:0.92;">Order in seconds — browse the full menu below.</p>
  <div style="display:inline-block; margin-top:24px; padding:12px 28px; border-radius:9999px; background:var(--brand-button-primary, #ffffff); color:var(--brand-button-primary-text, #111111); font-weight:700; font-size:16px;">View Menu ↓</div>
</section>
```
The hero "button" is a static visual pill (LOOK only). A future working hero CTA would become a second platform portal target like the cart (out of scope).

---

## 14. Test plan

**Unit — schemas (`tests/unit/lib/custom-chrome-schemas.test.ts`, template `hero-block-schemas.test.ts`):** header enabled + 1 marker → pass; enabled + 0 markers → fail (marker message); enabled + 2 markers → fail ("found 2"); **disabled** + 0 markers → pass (draft); hero enabled + 0 markers → pass (no marker rule); HTML > 100 KB → fail (length); empty/undefined → pass.

**Unit — sanitizer (`tests/unit/lib/sanitize-chrome-html.test.ts`):** the §10/security attack list — each payload neutralized AND `data-wn-cart-mount` preserved when present: inline `<script>`; `<img onerror>`; `<svg onload>`; `<svg><script>`/`<animate onbegin>`; `javascript:`/`vbscript:` href incl. `jav&#x09;ascript:`; `data:text/html` href/img; `data:image/svg+xml` img; CSS `expression()`/`url(javascript:)`/`behavior`/`-moz-binding`/`@import`; `<iframe>`/`<iframe srcdoc>`; `<object>`/`<embed>`; `<form><input>`; `<base>`; `<meta refresh>`; container escape `</div></header><script>`; mXSS classics (noscript/math/svg style breakouts); `<svg><use xlink:href="javascript:">`; `<a target=_blank>` → `rel` added; polyglot `data:image/png;base64,...><script>`; purity/idempotency (sanitize twice == once).

**Integration — components (`tests/unit/components/custom-header.test.tsx`, jsdom; render under a real `<CartProvider>` + spy `onOpen`):** A1 marker found & cart button portaled inside it; A2 two markers → one button in the first; A3 marker missing → `<DefaultHeader>` rendered + custom sentinel absent + working cart; A4 re-portal on HTML change (no orphan); A5 unmount → no button, no error; A6 StrictMode → exactly one button; A7 empty cart hides badge; A8 badge == item_count + aria-label "N items"; A9 99+ clamp; A10 bundles counted; A11 badge tracks add→qty→remove; A12 click flips `isCartOpen`/calls `onOpen` once; A13 Enter/Space activates; A14 drawer qty +/- with custom header → `updateQuantity` + badge updates; A15 drawer remove → badge decrements; A16 checkout → `router.push('/<slug>/checkout')` (mock `useRouter`) or interstitial; A17 `<CartDrawer>` not a descendant of `data-wn-custom-header` (portals to body); A18 accessible name contains "cart" + count; A19 `aria-haspopup="dialog"`; A20 `aria-live="polite"` region present + visual badge `aria-hidden`; A21 default path unchanged when disabled; A22 hero throws but header cart still works (independent boundaries); A23 sanitizer-stripped `<button onclick>` doesn't break the one working cart.

**e2e / visual:** Report-Only CSP window — confirm Meta Pixel (when env set), Mapbox tiles/CSS, Cloudinary upload, Sentry replay/tunnel, Convex WSS, Facebook OAuth all work; visual snapshot of a tenant menu with custom header+hero vs default.

**a11y:** axe pass on the custom-header portal button (name, role, popup, live region); focus ring not removed; badge contrast from branding.

**Regression:** existing `menu-client`/cart/hero tests still pass; `npm run lint` + `tsc` clean (no unused imports after `AdminEditPencil`/`OptimizedImage` move; correct strict types; `.superRefine` keeps `TenantInput` shape).

---

## 15. Reconciled conflicts (ties broken by reading code)

1. **`<CartTriggerButton>` reactivity — internal `useCart()` (02) vs prop `itemCount` (01).** RESOLVED: **internal `useCart()`** (§2.3). `CartProvider` is app-wide (`layout.tsx:47`), the portaled node is a logical React child of `<CustomHeader>` so it sits inside the provider and re-renders on every context change with zero coupling to the host's render graph. 01 explicitly blessed this alternative; 02 mandates it. Strictly safer for a portaled subtree.
2. **Store sanitized (03/04) vs store raw (01).** RESOLVED: **store SANITIZED** (§4.4). Editor/preview round-trip exactly what renders; minimal stored attack surface; render re-sanitizes regardless. 01's "store raw so the superadmin sees what they typed" is superseded — a non-persisted "as-typed" state could be kept in the form if desired, but the persisted/served value is always sanitized.
3. **Save path — actions (04) vs service functions (01/brief).** RESOLVED: **the ACTIONS** (`src/actions/tenants.ts`) are the live writers the form calls (`tenant-form-wrapper.tsx:1374/1383`), confirmed by reading code. Add the 4 fields to BOTH action payloads AND keep the duplicate service payloads in sync to prevent drift (§5.5). 01's reference to `createTenantSupabase`/`updateTenantSupabase` as THE save path is corrected.
4. **Menu revalidation on save.** RESOLVED: NET-NEW to both actions (today they revalidate only superadmin paths) — `revalidatePath('/<slug>/menu','layout')` + `invalidateTenantCache` (create before redirect, update before return) (§5.5). Complements, also fixes a latent hero/branding staleness gap.
5. **Marker enforcement — render fallback (01) vs save-time Zod (02/04).** RESOLVED: **both** (complementary). Save-time `tenantSchema.superRefine` "exactly one when header enabled" + post-sanitize re-check (friendly error, primary guard) AND render-time `markerMissing` fail-closed to `<DefaultHeader>` (defense in depth, covers DB-direct edits).
6. **Hero IIFE line number.** Phase-1 said `:596-604`; live is `:597-604`. Immaterial — implementers target the IIFE body, not a literal line.
7. **`useLayoutEffect` vs `useEffect`.** RESOLVED: `useIsomorphicLayoutEffect` shim (`useLayoutEffect` in browser, `useEffect` on server) — pre-paint portal mount, no marker-less flash, no SSR warning.

---

## 16. One-paragraph guarantee
Custom header/hero HTML defines only *look*. The header's single load-bearing contract is one empty `data-wn-cart-mount` element, into which the platform `createPortal`s a real React `<CartTriggerButton>` that reads `item_count` from `useCart()` and calls `setIsCartOpen(true)` — the exact same state and `<CartDrawer>` the default header uses. The drawer, its add/remove/qty/checkout logic, the cart context, and the open-state all live OUTSIDE the custom region and are unchanged. HTML is sanitized with `isomorphic-dompurify` on write (stored sanitized) AND render (memoized), backstopped by a Report-Only-then-enforcing CSP. If the marker is missing or the header throws, the header fails closed to `<DefaultHeader>`; the hero falls back independently to `renderDefaultHero(tenant)`. A functional cart is guaranteed in every code path, with no XSS surface added (the only interactive element is platform React, not tenant markup), and `npm run lint` + `tsc` pass under strict mode.
