# Custom Hero/Header Attacher — Architecture Design (Phase 2, agent 6)

**Status:** DESIGN ONLY. No implementation code, no migrations executed. This doc specifies the attacher mechanism end-to-end so implementation agents can build it as the smallest viable change.

**Scope of this doc (agent 6 — Architecture Designer):** the render boundary, component decomposition, injection + portal flow, data flow, error-boundary strategy, and branding exposure. Sanitization internals (the sanitizer module + its rules) and the superadmin form/persistence UI are owned by other agents; this doc defines the *contracts* they plug into.

---

## 0. Resolved Phase-1 uncertainties (verified by reading code now)

### (a) Is `generateBrandingCSS` / `--brand-*` already mounted on the menu route?

**No.** `grep -rn "generateBrandingCSS|--brand-" src/` returns only two call sites, **neither on the menu route**:

- `src/app/[tenant]/order/qr/[clientOrderId]/page.tsx:119` — the QR order-tracking page.
- `src/components/superadmin/enhanced-tenant-form.tsx:554` — a preview swatch inside the superadmin form.

`menu-client.tsx` consumes branding only as a JS object (`getTenantBranding(tenant)` at `menu-client.tsx:189`, final `branding` memo at `:208-211`) and applies individual values via inline `style={{ backgroundColor: branding.header, ... }}` (e.g. `:454-457`, `:511-513`). **The `--brand-*` CSS-variable surface does NOT exist anywhere in the menu DOM.**

**Consequence (design decision):** Custom HTML can only use `--brand-*` variables if we mount them ourselves. We will mount `generateBrandingCSS(branding)` as inline `style` **only on the `<CustomChrome>` wrapper elements** (header wrapper + hero wrapper), not globally. This is additive, scoped, and cannot affect the default-header path (which keeps its existing inline styles untouched).

### (b) Does `src/middleware.ts` set any CSP?

**No.** `src/middleware.ts` (re-read in full, 1-208) sets no security headers at all — it only does tenant rewrite + Supabase auth cookie handling + route protection. It never touches `supabaseResponse.headers.set(...)` for CSP/`Content-Security-Policy`/`X-*`. Combined with Phase-1's finding that `next.config.ts:56-89` sets only `Cache-Control`, **the app ships with zero CSP today.**

**Consequence (design decision):** There is no CSP to regress against, and inline scripts currently run unrestricted (Meta Pixel proves this, `meta-pixel-bootstrap.tsx:22`). Because we have no runtime CSP backstop, **sanitization is the entire defense** for tenant HTML. Per locked decision D1, the sanitizer must be strict and run on *every render of the custom string* (not just at save). This doc treats the sanitizer as a required dependency at the render boundary; introducing a CSP is explicitly **out of scope** for this phase (and risky given the unrestricted inline-script precedent), but the design must not *prevent* a future CSP — see §8.

---

## 1. The render boundary

Two independent injection points in `src/app/[tenant]/menu/menu-client.tsx`, each behind its own undefined-safe gate. Neither point alters the default rendering when the gate is false.

### 1a. Header boundary — replaces the inline `<header>` at `menu-client.tsx:452-528`

Today the JSX between line 452 and 528 is a literal `<header>`. We replace that single block with a conditional that chooses **custom header** vs **default header**, where the default header is the *same markup extracted verbatim* into `<DefaultHeader>` (see §2.4).

```tsx
// at menu-client.tsx ~:452 (replacing the inline <header> 452-528)
{customHeaderEnabled ? (
  <CustomRegionBoundary fallback={<DefaultHeader {...defaultHeaderProps} />}>
    <CustomHeader
      html={tenant!.custom_header_html as string}
      brandingStyle={brandingStyle}
      cartTrigger={
        <CartTriggerButton
          itemCount={item_count}
          onOpen={() => setIsCartOpen(true)}
          badgeBg={branding.menuCartBadgeBackground}
          badgeText={branding.menuCartBadgeText}
        />
      }
    />
  </CustomRegionBoundary>
) : (
  <DefaultHeader {...defaultHeaderProps} />
)}
```

**Header gate (undefined-safe):**

```ts
const customHeaderEnabled =
  tenant?.custom_header_enabled === true &&
  typeof tenant?.custom_header_html === 'string' &&
  tenant.custom_header_html.trim().length > 0
```

- `=== true` so `undefined`/`null`/`false` all fall through to default.
- The `html` prop is only read inside the `customHeaderEnabled` branch, so the non-null assertions in the snippet are safe (the gate already proved presence). Implementation may use a captured `const html = tenant.custom_header_html` to avoid the assertion.

The announcement banner (`menu-client.tsx:441-451`) stays **above** this boundary, unchanged — it is not part of the header chrome and must keep working regardless.

### 1b. Hero boundary — slots into the hero IIFE at `menu-client.tsx:596-604`

The existing IIFE selects among v4 block hero / null. We add the **custom hero as the highest-priority branch** inside the same IIFE, so it is mutually exclusive with the existing hero paths and inherits the existing "above `<main>`" placement.

```tsx
// menu-client.tsx ~:596 — inside the existing IIFE, FIRST check:
{(() => {
  // NEW: custom hero takes precedence when enabled + present
  if (customHeroEnabled) {
    return (
      <CustomRegionBoundary fallback={<DefaultHeroFallback ... />}>
        <CustomHero
          html={tenant!.custom_hero_html as string}
          brandingStyle={brandingStyle}
        />
      </CustomRegionBoundary>
    )
  }
  // EXISTING behavior unchanged below:
  const heroDesign = tenant?.hero_design as Record<string, unknown> | null
  const isBlockDesign = heroDesign && heroDesign.version === 4
  if (tenant?.hero_section_enabled !== false && heroDesign && isBlockDesign) {
    return <BlockHeroRenderer design={heroDesign as unknown as HeroBlockDesign} />
  }
  return null
})()}
```

**Hero gate (undefined-safe):**

```ts
const customHeroEnabled =
  tenant?.custom_hero_enabled === true &&
  typeof tenant?.custom_hero_html === 'string' &&
  tenant.custom_hero_html.trim().length > 0
```

**Hero fallback semantics (important):** Per D3, a broken/disabled/absent custom hero must fall back to *the default hero*, independent of the header. But the "default hero" is not one component — it is the **existing IIFE logic** (v4 block hero, or legacy `HeroRenderer` inside `LayoutDefault`, or the text hero, or `null`). So the error-boundary `fallback` for the hero region must reproduce *the existing IIFE branch selection* (block hero vs null), NOT a brand-new component. Concretely:

- When `customHeroEnabled` is `false` → we never enter the custom branch; the existing IIFE runs verbatim. ✅ default behavior preserved with zero change.
- When `customHeroEnabled` is `true` but `<CustomHero>` throws → the `CustomRegionBoundary` renders its `fallback`, and that fallback must be **the same selection the IIFE would have produced if the custom branch were absent** (i.e. compute `isBlockDesign`/`hero_section_enabled` again and render `<BlockHeroRenderer>` or `null`). We will extract that selection into a tiny pure helper `renderDefaultHero(tenant)` so both the "not enabled" path and the error fallback share one source of truth. The legacy `HeroRenderer`/text hero live *inside `LayoutDefault`* in `<main>` (layout-default.tsx:84-116) and are reached only when no top-level hero renders; the top-level IIFE only ever produces block-hero-or-null, so `renderDefaultHero` mirrors exactly that (block-hero-or-null) and the legacy/text hero continues to render inside `<main>` untouched.

> Naming note: the snippet's `<DefaultHeroFallback>` is shorthand for `renderDefaultHero(tenant)`; there is no new visual hero component — it is a function returning the existing branches.

---

## 2. Component decomposition

Five units. Four are new; one (`DefaultHeader`) is an extraction. All live under `src/components/customer/custom-chrome/` except where noted. All are client components (the parent `MenuClient` is `'use client'`).

### 2.1 `<CustomHeader>` — sanitized header renderer + cart portal host

**File:** `src/components/customer/custom-chrome/custom-header.tsx`
**Responsibility:** render the sanitized header HTML into a ref'd container via `dangerouslySetInnerHTML`, expose the brand vars on its wrapper, and portal the platform-owned `cartTrigger` into the `[data-wn-cart-mount]` marker inside that HTML.

```ts
interface CustomHeaderProps {
  /** Raw (un-sanitized) tenant HTML. Component sanitizes internally before render. */
  html: string
  /** generateBrandingCSS(branding) — injected as inline style on the wrapper. */
  brandingStyle: React.CSSProperties
  /** Platform-owned, fully-reactive cart trigger+badge. Portaled into the mount marker. */
  cartTrigger: React.ReactNode
}
```

Behavior summarized (full flow in §3):
- Sanitizes `html` with the strict sanitizer (memoized on `html`).
- Renders `<div ref={containerRef} data-wn-custom-header style={brandingStyle} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />`.
- After commit, finds `containerRef.current.querySelector('[data-wn-cart-mount]')` and `createPortal(cartTrigger, mountEl)`.
- The wrapper `<div>` should carry `sticky top-0 z-50` equivalents *only if* we want parity with the default sticky header. **Decision:** keep stickiness platform-controlled by giving the wrapper `className="sticky top-0 z-50"` (so cart accessibility while scrolling matches the default UX, and tenant HTML controls only inner look). This is the one structural class we own; everything inside is tenant-defined.

### 2.2 `<CustomHero>` — sanitized hero renderer (no portal)

**File:** `src/components/customer/custom-chrome/custom-hero.tsx`
**Responsibility:** render sanitized hero HTML with brand vars exposed. No cart, no portal, no interactivity — pure look.

```ts
interface CustomHeroProps {
  html: string
  brandingStyle: React.CSSProperties
}
```

- Sanitizes `html` (memoized on `html`), renders `<div data-wn-custom-hero style={brandingStyle} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />`.
- No `useEffect`/portal needed — there is nothing reactive to mount. (If a future phase wants e.g. a hero CTA that scrolls to menu, that becomes a portal target like the cart, but that is out of scope; D1 says LOOK-ONLY.)

### 2.3 `<CartTriggerButton>` — first-party reactive trigger + badge

**File:** `src/components/customer/custom-chrome/cart-trigger-button.tsx`
**Responsibility:** the **only** interactive element inside custom header HTML. It is platform-owned React, portaled in, so cart open + live badge survive regardless of tenant markup. This is the load-bearing guarantee for the HARD REQUIREMENT.

```ts
interface CartTriggerButtonProps {
  itemCount: number          // live item_count from useCart (passed down from MenuClient)
  onOpen: () => void         // () => setIsCartOpen(true)
  badgeBg: string            // branding.menuCartBadgeBackground
  badgeText: string          // branding.menuCartBadgeText
}
```

- Renders the existing trigger markup verbatim from `menu-client.tsx:502-519` (the 🛒 button + conditional badge), driven by props. Because `itemCount` and `onOpen` flow from `MenuClient`'s render (which subscribes to `useCart`), the portaled button re-renders reactively on add/remove/qty changes — **add, remove, update qty, badge count all stay live**; clicking calls `setIsCartOpen(true)` which opens the same `<CartDrawer>` sibling (`menu-client.tsx:699`), so open/close/checkout are unchanged.
- **Why props not `useCart()` directly:** either works (CartProvider is app-wide per Phase-1, so `useCart()` inside this component would also succeed). We pass props to keep this component a dumb presenter and to make it trivially testable; `MenuClient` already destructures `item_count` (`menu-client.tsx:76`). Implementation may instead call `useCart()` internally — both satisfy the requirement. **Chosen: props**, to mirror how `<CartDrawer>` receives `branding` and to avoid a second subscription.

### 2.4 `<DefaultHeader>` — verbatim extraction of the inline header

**File:** `src/components/customer/custom-chrome/default-header.tsx` (or co-located; final path implementer's choice — keep it next to the others).
**Responsibility:** the existing inline `<header>` (`menu-client.tsx:452-528`) lifted out **verbatim**, parameterized by the values it currently closes over. Used by BOTH the "not enabled" branch AND the error-boundary fallback, guaranteeing the fallback is byte-for-byte the current UX.

```ts
interface DefaultHeaderProps {
  tenant: Tenant | null
  tenantSlug: string
  branding: BrandingColors          // from getTenantBranding, the menu-client `branding` memo
  itemCount: number                 // item_count
  onOpenCart: () => void            // () => setIsCartOpen(true)
  isBrandAdmin: boolean
  onEditMainHeader: () => void      // openBrandingEditor('main_header')
  onEditCartBadge: () => void       // openBrandingEditor('cart_badge')
}
```

- Body is the current `<header>...</header>` (452-528) with closures replaced by props: `branding.*` stays, `tenant?.logo_url`/`tenant?.name` stay, `OptimizedImage` import moves with it, `AdminEditPencil` usages call `onEditMainHeader`/`onEditCartBadge`, the cart `<button>` calls `onOpenCart`.
- `AdminEditPencil` is currently a local function in `menu-client.tsx:58-72`. **Decision:** keep `AdminEditPencil` defined in `menu-client.tsx` and **pass the two pencils as render via the `isBrandAdmin` + `onEdit*` props** by re-declaring `AdminEditPencil` inside `DefaultHeader` is undesirable (duplication). Cleanest minimal move: export `AdminEditPencil` from a shared spot or pass it as `children`/render-props. To stay minimal and avoid a refactor sprawl, **co-locate a copy of the tiny `AdminEditPencil` is NOT allowed** (duplication). Instead: lift `AdminEditPencil` into `default-header.tsx` and have `menu-client.tsx` import it from there (it is only used in the header region anyway after extraction — verify no other usages before moving; if other usages exist, export it from a `custom-chrome/admin-edit-pencil.tsx` and import in both). This is the *only* permitted refactor beyond the extraction itself.

> `defaultHeaderProps` referenced in §1a is just this prop bag assembled once in `MenuClient`.

### 2.5 `<CustomRegionBoundary>` — class error boundary (shared by header & hero)

**File:** `src/components/customer/custom-chrome/custom-region-boundary.tsx`
**Responsibility:** catch render/commit errors thrown by a custom region and render a `fallback` instead, **independently per region** (one instance wraps the header, a separate instance wraps the hero — see §5).

```ts
interface CustomRegionBoundaryProps {
  fallback: React.ReactNode  // header: <DefaultHeader/>; hero: renderDefaultHero(tenant)
  region?: 'header' | 'hero' // for logging/telemetry only
  children: React.ReactNode
}
interface CustomRegionBoundaryState { hasError: boolean }
```

---

## 3. Injection + portal flow (the load-bearing mechanism)

This is the crux: render attacker-controlled (but sanitized) HTML, then graft a live React cart button into a marker element inside it, with correct React-19 timing.

### 3.1 Sanitize → render HTML

Inside `<CustomHeader>`:

```ts
const sanitizedHtml = useMemo(() => sanitizeChromeHtml(html), [html])
```

- `sanitizeChromeHtml` is the strict D1 sanitizer (owned by the security agent). Contract this design relies on: returns a **string** of HTML with all `<script>`, `on*` handlers, `javascript:`/`data:` (non-image) URLs, and dangerous CSS removed, while **preserving** an element bearing `data-wn-cart-mount` (the sanitizer must whitelist `data-wn-cart-mount` and `data-wn-*` attributes so the mount marker survives). Memoized on `html` so it only re-runs when the tenant string changes (cheap on re-renders driven by cart/badge updates).
- Rendered via `dangerouslySetInnerHTML` into a ref'd container:

```tsx
return (
  <div
    ref={containerRef}
    data-wn-custom-header
    className="sticky top-0 z-50 w-full"
    style={brandingStyle}
    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
  />
)
```

### 3.2 Obtain the container ref + locate the mount marker

```ts
const containerRef = useRef<HTMLDivElement>(null)
const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
```

### 3.3 React 19 timing — find marker AFTER innerHTML is committed

`dangerouslySetInnerHTML` sets the container's `innerHTML` during the commit phase. A `useEffect` (or `useLayoutEffect`) runs **after** commit, so by the time the effect body runs the marker element exists in the DOM. We use **`useLayoutEffect`** so the portal mounts synchronously before paint (no flash of marker-less header):

```ts
useLayoutEffect(() => {
  const el = containerRef.current?.querySelector<HTMLElement>('[data-wn-cart-mount]') ?? null
  setMountNode(el)
  return () => setMountNode(null)
}, [sanitizedHtml]) // re-run when the rendered HTML changes
```

- **Dependency is `sanitizedHtml`, not `html`** — when the tenant HTML changes, `sanitizedHtml` changes (memo), React re-commits the new `innerHTML`, then this effect re-runs and re-queries the (new) marker. If the new HTML lacks a marker, `el` is `null` → no portal (graceful: header renders without a cart button only if the tenant deleted the marker; see §3.6 for the safeguard).
- **Why `useLayoutEffect` is safe re SSR:** `MenuClient` is `'use client'` and the custom-chrome subtree renders client-side; `useLayoutEffect` warnings only fire during SSR. To avoid the dev warning, the component can guard with a `useIsomorphicLayoutEffect` shim (use `useEffect` on server) — minor, implementer's choice. `useEffect` also works and is acceptable (one extra frame before the cart button paints; acceptable since the badge count is the only visible reactive bit and it appears within the same tick).

### 3.4 Portal the live cart trigger into the marker

```tsx
return (
  <>
    <div ref={containerRef} data-wn-custom-header className="sticky top-0 z-50 w-full"
         style={brandingStyle} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
    {mountNode && createPortal(cartTrigger, mountNode)}
  </>
)
```

- `cartTrigger` is the `<CartTriggerButton>` element constructed in `MenuClient` (§1a). Because it is created in `MenuClient`'s render scope, it closes over the live `item_count`/`setIsCartOpen`; every cart mutation re-renders `MenuClient` → new `cartTrigger` element → React reconciles the portal content in place. **Badge stays live; click still opens the drawer.**
- **Coexistence with `dangerouslySetInnerHTML`:** React does not manage children of a `dangerouslySetInnerHTML` node, so portaling *into* a descendant of it is the supported pattern — React owns the portal subtree, the browser owns the surrounding innerHTML, and they don't fight because the marker element itself is left empty by the tenant (it is just a placeholder `<div data-wn-cart-mount></div>`). React appends the portal as a child of that marker. On unmount/HTML-change, React removes its portal children cleanly before the next commit replaces innerHTML.

### 3.5 Cleanup on unmount / HTML change

- The effect's cleanup `setMountNode(null)` unmounts the portal (React tears down `<CartTriggerButton>` and removes its DOM) **before** the marker element is replaced by the next `innerHTML` write. Order: state→null triggers portal unmount in the same commit cycle that re-renders with new `sanitizedHtml`; React unmounts the old portal, commits new innerHTML, then the re-run effect re-queries and re-mounts. No dangling nodes, no double-mount.
- On full component unmount (e.g. toggling back to default header, or route change), React unmounts `<CustomHeader>`, which unmounts the portal and discards the container — standard.

### 3.6 Marker-missing safeguard (cart must never disappear)

If the tenant HTML has **no** `[data-wn-cart-mount]` (forgot it, or sanitizer/tenant removed it), `mountNode` stays `null` and there would be **no cart trigger** — violating the HARD REQUIREMENT. Mitigations, in order of preference:

1. **Validation at save time (primary):** the save action (other agent) rejects custom header HTML that lacks exactly one `data-wn-cart-mount` element (Zod `.refine`). This is the main guard.
2. **Runtime fallback (defense in depth, specified here):** in the `useLayoutEffect`, if `el` is `null`, the design mandates a fallback so the cart is always reachable. Options: (a) treat as an error → let `<CustomRegionBoundary>` show `<DefaultHeader>` (cleanest: a header missing its cart mount is "invalid" → fall back entirely). **Chosen: (a).** Implementation: when the marker is absent, call a `onMissingMount?` callback or throw a sentinel that the boundary catches, so the whole custom header is discarded in favor of `<DefaultHeader>`. This keeps the invariant "cart always present" without inventing a floating button. (Throwing inside an effect does not hit the error boundary; instead set an error-flag state and `return <DefaultHeader/>` from `<CustomHeader>` on next render, OR surface via the boundary by rendering a component that throws. Simplest: `<CustomHeader>` holds `const [markerMissing, setMarkerMissing] = useState(false)`; if true, render `props.fallback`. So `<CustomHeader>` also accepts an optional `fallback` prop mirroring the boundary's, used for this specific case.)

Updated `<CustomHeader>` prop (adds the runtime fallback):

```ts
interface CustomHeaderProps {
  html: string
  brandingStyle: React.CSSProperties
  cartTrigger: React.ReactNode
  fallback: React.ReactNode   // <DefaultHeader/> — rendered if marker is missing at runtime
}
```

---

## 4. Data flow (exactly what threads through)

New tenant columns → server allowlist → page props → MenuClient props → custom-chrome components.

### 4.1 New columns on `tenants` (migration; mirror `hero_design`/`hero_section_enabled`)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `custom_header_html` | `text` | `NULL` | Sanitizable header HTML string |
| `custom_header_enabled` | `boolean` | `false` | Header gate |
| `custom_hero_html` | `text` | `NULL` | Sanitizable hero HTML string |
| `custom_hero_enabled` | `boolean` | `false` | Hero gate |

(Migration file authored by the persistence agent: `supabase/migrations/<14-digit>_custom_header_hero_html.sql`, pattern `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ... ` + `COMMENT ON COLUMN`. Verify live schema with `list_tables` first, since the original `hero_design` DDL is not in the migrations folder.)

### 4.2 Server allowlist — **MUST add the 4 columns**

In `src/app/[tenant]/menu/menu-server.tsx`, the `.select(...)` at lines 9-34 is an explicit allowlist; **any column not listed is `undefined` on the menu page** (Phase-1 fact). Add to the select (e.g. on the hero line `:23` or a new line):

```
custom_header_html, custom_header_enabled, custom_hero_html, custom_hero_enabled
```

These flow into `tenant` (cast to `Tenant` at `menu-server.tsx:43`) and return via `getMenuData` → `page.tsx:14`.

### 4.3 Types — add to `Tenant` interface

`src/types/database.ts` `Tenant` interface (106-143) gains:

```ts
custom_header_html?: string | null;
custom_header_enabled?: boolean;
custom_hero_html?: string | null;
custom_hero_enabled?: boolean;
```

(The `[key: string]: unknown` index signature at `:143` means the menu would compile without these, but we add explicit types for safety/autocomplete. `src/types/supabase.ts` Row/Insert/Update blocks ~1279/1400/1521 updated by the persistence agent or via `generate_typescript_types`.)

### 4.4 `page.tsx` → `MenuClientProps`

**No `page.tsx` change required.** `page.tsx:17-25` already passes the whole `tenant` object to `<MenuClient tenant={tenant} .../>`. The new fields ride along on `tenant`. `MenuClientProps` (`menu-client.tsx:23-31`) is unchanged — `tenant: Tenant | null` already covers it.

### 4.5 Inside `MenuClient` — derive gates + assemble props

```ts
// gates (§1)
const customHeaderEnabled = tenant?.custom_header_enabled === true
  && typeof tenant?.custom_header_html === 'string' && tenant.custom_header_html.trim().length > 0
const customHeroEnabled = tenant?.custom_hero_enabled === true
  && typeof tenant?.custom_hero_html === 'string' && tenant.custom_hero_html.trim().length > 0

// branding CSS vars for the wrappers (§6)
const brandingStyle = useMemo(() => generateBrandingCSS(branding), [branding])

// default header prop bag (reused by fallback + not-enabled branch)
const defaultHeaderProps = {
  tenant, tenantSlug, branding, itemCount: item_count,
  onOpenCart: () => setIsCartOpen(true), isBrandAdmin,
  onEditMainHeader: () => openBrandingEditor('main_header'),
  onEditCartBadge: () => openBrandingEditor('cart_badge'),
}
```

**Threaded list (end to end):**
`custom_header_html` → server select → `tenant.custom_header_html` → gate + `<CustomHeader html>`.
`custom_header_enabled` → server select → `tenant.custom_header_enabled` → gate.
`custom_hero_html` → server select → `tenant.custom_hero_html` → gate + `<CustomHero html>`.
`custom_hero_enabled` → server select → `tenant.custom_hero_enabled` → gate.
`branding` (existing) → `generateBrandingCSS` → `brandingStyle` → both wrappers.
`item_count` + `setIsCartOpen` (existing) → `<CartTriggerButton>` / `<DefaultHeader>`.

---

## 5. Error-boundary strategy (independent per region)

Per D3, header and hero failures must be isolated. We use **two separate `<CustomRegionBoundary>` instances** (one wrapping `<CustomHeader>`, one wrapping `<CustomHero>`), each with its own `fallback`. React error boundaries catch errors in their subtree only, so a throw in the hero cannot unmount the header and vice versa.

```tsx
class CustomRegionBoundary extends React.Component<Props, State> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err, info) {
    console.error(`[custom-chrome:${this.props.region}] render error, falling back`, err, info)
    // optional: fire analytics 'custom_chrome_error' so superadmin sees broken HTML
  }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}
```

- **Header instance:** `fallback={<DefaultHeader {...defaultHeaderProps} />}`. Any throw from sanitize/render/portal → default header with a fully working cart.
- **Hero instance:** `fallback={renderDefaultHero(tenant)}` (the extracted IIFE selection = `<BlockHeroRenderer>` or `null`). Any throw → default hero behavior.
- **Coverage caveat:** error boundaries catch render/lifecycle/constructor errors, **not** errors thrown asynchronously inside effects/event handlers. The two async-ish risks here are handled explicitly: (1) the portal effect's marker-missing case is handled by the §3.6 state-flag fallback (not relying on the boundary); (2) `createPortal` into a valid node does not throw. Sanitizer exceptions happen during `useMemo` in render → caught by the boundary. So the boundary + the §3.6 flag together cover all paths.
- **Reset behavior:** if the superadmin fixes the HTML and re-saves, `revalidatePath` + `router.refresh()` re-renders `MenuClient` with new props; the boundary keeps `hasError: true` across re-renders unless reset. **Decision:** key each boundary by the html string — `<CustomRegionBoundary key={tenant.custom_header_html} ...>` — so a changed HTML string remounts the boundary (fresh `hasError: false`) and retries the new HTML. Minimal and robust.

---

## 6. Branding exposure (`--brand-*` into custom HTML)

From §0(a): `--brand-*` is **not** mounted on the menu route. We mount it **scoped to the custom wrappers only**:

- `MenuClient` computes `const brandingStyle = useMemo(() => generateBrandingCSS(branding), [branding])` (returns a `React.CSSProperties` of `--brand-*` vars, `branding-utils.ts:216-261`).
- `<CustomHeader>` and `<CustomHero>` apply `style={brandingStyle}` on their outermost `<div>` (the same `<div>` that hosts `dangerouslySetInnerHTML`). CSS custom properties inherit, so tenant HTML inside can reference e.g. `background: var(--brand-header)`, `color: var(--brand-menu-cart-badge-text)`, etc. This gives custom HTML access to the full 40+ brand palette with zero new global surface and no effect on the default-header path.
- The values from `generateBrandingCSS` originate from `getTenantBranding(tenant)` which already passes through `sanitizeCSSColor` (`branding-utils.ts:414`) for color fields, so injected var *values* are color-safe. (Tenant HTML *using* the vars is still subject to the §3.1 sanitizer for its own `style`/CSS.)
- **No global mount.** We deliberately do NOT wrap `<main>` or the page root — keeping the change additive and reversible, and avoiding any cascade onto the default header/menu cards (which read branding via JS, not vars).

---

## 7. Why the cart stays fully functional (requirement trace)

| Capability | Mechanism |
|---|---|
| Badge count live | `<CartTriggerButton itemCount={item_count}>` created in `MenuClient` render scope (subscribed to `useCart`); cart mutations re-render MenuClient → portal content updates. |
| Open drawer | `onOpen={() => setIsCartOpen(true)}` → same `isCartOpen` state (`menu-client.tsx:93`) → same `<CartDrawer open>` sibling (`:699`). |
| Close drawer | `<CartDrawer onClose={() => setIsCartOpen(false)}>` unchanged. |
| Add / remove / update qty | `<CartDrawer>` consumes `useCart` directly (`cart-drawer.tsx:61`, qty `:259/:270`, remove `:232`); it renders to `document.body` portal already — **never inside the header DOM**, so custom header HTML cannot affect it. |
| Checkout | `<CartDrawer>` `router.push('/<slug>/checkout')` (`:90-104`) unchanged. |
| Always reachable | Marker-missing → fall back to `<DefaultHeader>` (§3.6); any header throw → boundary → `<DefaultHeader>` (§5). The cart trigger therefore exists in every code path. |

`<CartDrawer>` and its open-state plumbing are **outside** the custom region entirely; only the *trigger* lives inside custom HTML, and that trigger is platform React, not tenant markup. This is the architectural guarantee.

---

## 8. Security posture (design-level; sanitizer owned by another agent)

- **Sanitize on every render of the string** (memoized on `html`), per D1. No reliance on save-time-only sanitization (defense in depth: a row edited via DB/another path still gets sanitized at render).
- Sanitizer contract (consumed here): strip `<script>`, all `on*` attrs, `javascript:`/`data:` (non-image) URLs, dangerous CSS (`expression()`, `url(javascript:)`, `behavior`, untrusted `@import`); **whitelist `data-wn-cart-mount`** and `data-wn-*` so the portal marker survives.
- No new dependency is mandated by *this* doc beyond the sanitizer module (the security agent decides DOMPurify vs hand-rolled per the existing `hero-block-schemas.ts` precedent). No CSP introduced this phase (§0b) — and the design does not block adding one later: portaled React + sanitized innerHTML are both CSP-compatible as long as a future policy allows the app's own inline styles (the only inline-style we add is the `--brand-*` wrapper, which would need `style-src 'unsafe-inline'` or nonce — same as today's many inline styles).
- `next/image` allowlist is bypassed by raw `<img>` in tenant HTML; that is acceptable for LOOK-only (no script), and image `src` is constrained by the sanitizer's URL rules.

---

## 9. File-change summary (minimal-change checklist for implementers)

**New files (this feature):**
- `src/components/customer/custom-chrome/custom-header.tsx` — `<CustomHeader>` (§2.1, §3)
- `src/components/customer/custom-chrome/custom-hero.tsx` — `<CustomHero>` (§2.2)
- `src/components/customer/custom-chrome/cart-trigger-button.tsx` — `<CartTriggerButton>` (§2.3)
- `src/components/customer/custom-chrome/default-header.tsx` — `<DefaultHeader>` extracted from `menu-client.tsx:452-528` (§2.4)
- `src/components/customer/custom-chrome/custom-region-boundary.tsx` — `<CustomRegionBoundary>` (§2.5, §5)
- (security agent) sanitizer module, e.g. `src/lib/sanitize-chrome-html.ts`

**Edited files:**
- `src/app/[tenant]/menu/menu-client.tsx` — extract header to `<DefaultHeader>`; add header gate + custom-header boundary at `:452`; add custom-hero branch + `renderDefaultHero` at `:596`; compute `brandingStyle`, gates, `defaultHeaderProps`; possibly move `AdminEditPencil` (§2.4).
- `src/app/[tenant]/menu/menu-server.tsx` — add 4 columns to `.select` allowlist (`:9-34`).
- `src/types/database.ts` — add 4 fields to `Tenant` (§4.3).
- `src/types/supabase.ts` — Row/Insert/Update for `tenants` (persistence agent).
- `src/lib/tenants-service.ts` `tenantSchema` (`:30`) + superadmin form (`tenant-form-wrapper.tsx`) + save path — persistence/UI agents (D2/D4).
- `supabase/migrations/<ts>_custom_header_hero_html.sql` — persistence agent.

**No change:** `page.tsx` (tenant already passed), `cart-drawer.tsx`, `useCart.tsx`, `next.config.ts`, `middleware.ts`.

---

## 10. Open contracts handed to other agents

1. **Sanitizer (security agent):** signature `sanitizeChromeHtml(html: string): string`; rules per §8; must preserve `data-wn-cart-mount`/`data-wn-*`.
2. **Save-time validation (persistence agent):** reject header HTML lacking exactly one `[data-wn-cart-mount]`; run sanitizer at save too (store sanitized or store raw + sanitize-on-render — design supports both since render always sanitizes; recommend store-raw so superadmin sees what they typed and the editable field round-trips).
3. **Superadmin form (UI agent):** the toggles + FileReader-into-editable-textarea + preview (D4); the preview can reuse `<CustomHeader>`/`<CustomHero>` with a fake `cartTrigger` for fidelity.
4. **Revalidation (persistence agent):** on save, `revalidatePath('/<slug>/menu','layout')` AND `invalidateTenantCache(slug, tenantId)` (Phase-1 cache facts).
