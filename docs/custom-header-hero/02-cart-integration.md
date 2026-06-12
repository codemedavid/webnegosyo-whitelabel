# Custom Hero/Header Attacher — Cart Integration Contract (Phase 2, agent 7)

**Status:** DESIGN ONLY. No implementation code, no migrations executed. This doc defines the *exact* contract that keeps the shopping cart FULLY FUNCTIONAL when custom header HTML is attached, and the precise DOM/markup/portal/lifecycle rules implementers must follow.

**Builds on:** `01-architecture.md` (agent 6). Where this doc deviates from the architecture doc, it is flagged explicitly in **§0 Conflicts & resolutions** — there is exactly one substantive refinement (the `<CartTriggerButton>` consumes `useCart()` internally rather than receiving `itemCount` as a prop), made to satisfy this role's explicit instruction (#2) and to remove a re-render hazard. Everything else is consistent.

**Owned by this doc (agent 7 — Cart Integration Designer):**
1. The header HTML DOM-marker contract (required cart mount + optional slots).
2. The `<CartTriggerButton>` component contract (props, DOM output, reactivity, a11y).
3. The portal lifecycle (absent node → fail closed, multiple matches, re-portal on HTML change, teardown, React 19 + StrictMode safety).
4. What stays UNCHANGED in `MenuClient`.
5. The end-to-end runtime trace.
6. The Phase-4 integration-test assertion list.

**Not owned here:** sanitizer internals (security agent), persistence/migration/types (persistence agent), superadmin form UI (UI agent), the `<CustomHeader>`/`<CustomHero>`/`<CustomRegionBoundary>` shells (architecture agent, §1–§5 of `01-architecture.md`). This doc specifies only the *cart-facing* contracts those shells must honor.

---

## 0. Conflicts & resolutions (vs `01-architecture.md`)

| Topic | Architecture doc (agent 6) | This doc (agent 7) | Resolution |
|---|---|---|---|
| How `<CartTriggerButton>` gets `item_count` | Passes `itemCount={item_count}` as a prop from `MenuClient`; explicitly says "Implementation may instead call `useCart()` internally — both satisfy the requirement. **Chosen: props**." | **`<CartTriggerButton>` calls `useCart()` internally** to read `item_count`; takes only `onOpen` + badge colors as props. | **Adopt internal `useCart()`.** This role's instruction (#2) mandates it ("reading `item_count` from `useCart()` internally"). It is *more* robust for a portaled node: see §3.5 — a portaled subtree's reactivity depends only on the React owner re-rendering, and reading from context inside the portaled component guarantees the badge re-renders on every cart mutation even if a future refactor stops `MenuClient` from destructuring `item_count`. The architecture doc explicitly blesses this alternative, so this is a refinement, not a contradiction. |
| `<CartTriggerButton>` prop shape | `{ itemCount, onOpen, badgeBg, badgeText }` | `{ onOpen, badgeBg, badgeText }` (no `itemCount`) | This doc's shape is canonical for `<CartTriggerButton>`; `MenuClient` no longer needs to pass `itemCount` into the trigger (it still uses `item_count` for `<DefaultHeader>`). |
| Everything else (gates, boundaries, fail-closed on missing marker, branding wrapper, `<CartDrawer>` untouched) | — | — | **No conflict.** Fully consistent; this doc tightens the marker/portal/test details. |

All Phase-1 facts cited below were re-verified against the live source in this session (`menu-client.tsx`, `cart-drawer.tsx`, `useCart.tsx`, `cart-utils.ts`, `branding-utils.ts`).

---

## 1. Header HTML DOM-marker contract

Custom HEADER HTML is sanitized tenant markup that the platform renders via `dangerouslySetInnerHTML` and then *grafts live React into* at well-known marker elements. Markers are plain HTML attributes the tenant author places in their HTML; the platform finds them by `querySelector` after the innerHTML commit and injects platform-owned React via `createPortal`.

**Namespace:** all platform markers use the `data-wn-*` prefix (`wn` = WebNegosyo). The sanitizer (D1) MUST whitelist `data-wn-cart-mount` and all `data-wn-*` attributes so markers survive sanitization (this is restated as a hard requirement to the security agent in §7). Markers are HERO-agnostic: **only the header HTML carries `data-wn-cart-mount`**. The hero HTML has no markers and no portals (per `01-architecture.md` §2.2 — hero is pure look).

### 1.1 REQUIRED: `data-wn-cart-mount` (the cart mount marker)

| Property | Value |
|---|---|
| Attribute | `data-wn-cart-mount` (boolean/presence attribute; value is ignored — use `data-wn-cart-mount` or `data-wn-cart-mount=""`) |
| Cardinality | **Exactly one** element in the header HTML. Zero → fail closed (§3.2). More than one → only the **first in document order** receives the cart; the rest stay empty (§3.3). Save-time validation SHOULD reject ≠1 (§7). |
| Element type | Any non-void HTML element that can contain children: `<div>`, `<span>`, `<li>`, `<button>` is **discouraged** (nested interactive — see note), `<a>` is **forbidden** as the mount host (the portaled `<button>` inside an `<a>` is invalid HTML and an a11y trap). Recommend `<div data-wn-cart-mount></div>` or `<span data-wn-cart-mount></span>`. |
| Required to be empty? | **Yes, by convention.** The tenant leaves it empty; the platform appends the `<CartTriggerButton>` as its child via `createPortal`. If the tenant puts content inside, that content remains in the DOM **alongside** the portaled button (React appends portal children; it does not clear sibling DOM). To avoid a duplicate/confusing trigger, the marker MUST be empty — enforce in save-time validation if feasible; at runtime the platform does not clear it (clearing manually-set innerHTML children would fight the browser). |
| What the platform injects | The `<CartTriggerButton>` (§2): the real, reactive cart trigger + live badge. Clicking it opens the same `<CartDrawer>` used by the default header. |
| Position responsibility | The **tenant** decides where the cart sits visually by placing the marker element where they want it (flex/grid context, alignment). The platform injects only the button; the marker's box/layout is tenant CSS. |

> **Why not let the tenant's own `<button>` be the trigger?** Because D1 strips `on*` handlers and `<script>`, a tenant `<button>` is inert — it cannot open the drawer or reflect `item_count`. The platform-owned portaled button is the *only* path to a working cart. Therefore the marker is REQUIRED and a header lacking it is invalid (fail closed → default header, which has a working cart).

> **Nested-interactive note:** the portaled `<CartTriggerButton>` is itself a `<button>`. So `data-wn-cart-mount` must NOT be on an `<a>` or `<button>` (no `<button>`-in-`<button>` / `<button>`-in-`<a>`). Save-time validation SHOULD warn/reject if the mount host is `<a>`/`<button>`.

### 1.2 OPTIONAL slots (platform-injected content; tenant opts in by including the marker)

These let tenant HTML show platform-managed dynamic values (logo, store name) without the tenant hard-coding them, so the same HTML works across re-brands. If a slot marker is **absent**, the platform injects nothing there and the tenant's own static markup (if any) stands — slots are purely additive and never required.

| Marker | Cardinality | Platform injects | Fallback if absent | Fallback if injected value empty |
|---|---|---|---|---|
| `data-wn-logo` | 0 or 1 (first match wins) | A portaled `<OptimizedImage>` of `tenant.logo_url` (the same 48px rounded avatar used in the default header, `menu-client.tsx:463-472`), OR — if `tenant.logo_url` is falsy — the initial-letter avatar fallback (`menu-client.tsx:473-482`). | Nothing injected; tenant's own logo markup (if present in their HTML) renders as-is. | Renders the initial-letter avatar (never a broken image). |
| `data-wn-store-name` | 0 or 1 (first match wins) | A portaled `<span>`/text node with `tenant.name || tenantSlug.replace(/-/g,' ')` (matches `menu-client.tsx:489`). | Nothing injected; tenant's own name text stands. | Falls back to `tenantSlug`-derived name; never empty. |

**Slot rules (shared with the cart marker):**
- Same `querySelector('[data-wn-logo]')` / `querySelector('[data-wn-store-name]')` first-match semantics.
- Slots are **non-load-bearing**: their absence or failure NEVER triggers the fail-closed path. Only `data-wn-cart-mount` is load-bearing (the cart is the HARD REQUIREMENT). A header with a working cart marker but no logo/name slots is fully valid.
- Slots are sanitizer-safe targets: the platform injects React (image/text), not tenant strings, so no XSS surface is added.

**Phase scoping for slots:** the cart marker (§1.1) is REQUIRED and MUST ship in this phase. The logo/name slots (§1.2) are SPECIFIED here so the marker namespace and portal infra are designed once, but they are **optional to implement in Phase 3** — they reuse the exact same multi-portal mechanism as the cart marker (§3.6), so adding them is incremental. If Phase 3 ships cart-only, the slots remain a documented, reserved extension and tenants simply hard-code logo/name in their HTML.

### 1.3 Marker summary table (for the superadmin author docs / preview help text)

| Marker | Required? | Put it on | Platform fills it with | Leave empty? |
|---|---|---|---|---|
| `data-wn-cart-mount` | **Yes (exactly 1)** | `<div>`/`<span>` (not `<a>`/`<button>`) | Live cart button + badge | **Yes** |
| `data-wn-logo` | No (0–1) | `<div>`/`<span>` | Tenant logo image (or initial avatar) | Yes |
| `data-wn-store-name` | No (0–1) | `<span>`/`<h1>`/`<div>` | Tenant store name text | Yes |

---

## 2. `<CartTriggerButton>` component contract

**File:** `src/components/customer/custom-chrome/cart-trigger-button.tsx`
**Type:** client component (`'use client'`; it calls `useCart()`).
**Role:** the single interactive element the platform portals into `data-wn-cart-mount`. It is the load-bearing guarantee for "cart stays fully functional".

### 2.1 Props (canonical — overrides `01-architecture.md` §2.3)

```ts
interface CartTriggerButtonProps {
  /** Opens the shared cart drawer. In MenuClient: () => setIsCartOpen(true). */
  onOpen: () => void
  /** branding.menuCartBadgeBackground — badge pill background color. */
  badgeBg: string
  /** branding.menuCartBadgeText — badge number text color. */
  badgeText: string
  /** Optional: branding.textSecondary for the cart glyph color (parity with default header :505). Defaults to currentColor so it inherits the tenant header's text color via --brand-* if omitted. */
  iconColor?: string
}
```

- **`item_count` is NOT a prop.** It is read **inside** the component: `const { item_count } = useCart()`. This is safe because `CartProvider` is app-wide (root `layout.tsx:47`, Phase-1 fact) and `useCart()` succeeds anywhere under it; the portaled node, although physically inside browser-managed innerHTML, is logically a child of this React component in the React tree, so it is still inside the provider and re-renders on every context change. See §3.5 for why this is the more robust choice for a portaled subtree.
- **`onOpen`, `badgeBg`, `badgeText`** flow from `MenuClient`'s `branding` memo (`menu-client.tsx:189/208-211`) and the existing `setIsCartOpen` setter (`:93`). They are stable enough to not cause churn (`branding` is memoized; `onOpen` may be wrapped in `useCallback` in `MenuClient` to keep referential stability, but is not required for correctness).

### 2.2 DOM output (verbatim parity with the existing trigger `menu-client.tsx:502-519`)

The component renders the **same markup the default header uses today**, so the look/behavior is identical whether or not custom HTML is attached:

```tsx
'use client'
export function CartTriggerButton({ onOpen, badgeBg, badgeText, iconColor }: CartTriggerButtonProps) {
  const { item_count } = useCart()
  const display = item_count > 99 ? '99+' : String(item_count)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        item_count > 0
          ? `Open cart, ${item_count} ${item_count === 1 ? 'item' : 'items'}`
          : 'Open cart'
      }
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
    </button>
  )
}
```

Notes on the DOM:
- It is a single `<button type="button">` (explicit `type` so it never submits a tenant `<form>` if the tenant wrapped the mount in one).
- `item_count` source: `useCart()` → `item_count` is `getFullCartItemCount(items, bundleItems)` (`cart-utils.ts:406-413`), i.e. regular item quantities + bundle slot quantities × bundle quantity. The badge therefore reflects bundles too, identically to the default header.
- The 🛒 glyph and badge geometry match `:507-518` exactly so swapping in the custom header is visually seamless when the tenant simply re-skins around it.

### 2.3 Reactivity (how the badge stays live — the HARD REQUIREMENT)

- `<CartTriggerButton>` is **real React** that subscribes to `CartContext` via `useCart()`. The context value is a memo (`useCart.tsx:725-765`) whose identity changes whenever `items`/`bundleItems` (hence `item_count`, `useCart.tsx:721`) change.
- Any cart mutation — `addItem`, `removeItem`, `updateQuantity`, `addBundleToCart`, `updateBundleQuantity`, `removeBundleFromCart`, `clearCart` — updates `items`/`bundleItems` → new context value → **every** `useCart()` consumer re-renders, including the portaled `<CartTriggerButton>`. The badge number and its show/hide (`item_count > 0`) update on the same React commit as the drawer's own line items.
- This holds **regardless of where the button is portaled** (inside arbitrary tenant innerHTML), because React reconciles portal content by React-tree position, not DOM position. The browser-owned surrounding innerHTML is inert and never touched on a cart update; only the portal subtree re-renders.
- **No effects, no manual DOM writes, no event bridging.** The reactivity is entirely the React render cycle — this is why custom tenant markup cannot break it.

### 2.4 Accessibility

| Concern | Spec |
|---|---|
| Role | Native `<button type="button">` (implicit `role="button"`, keyboard-activatable via Enter/Space, focusable). |
| Accessible name | `aria-label` describing action + count: `"Open cart, 3 items"` / `"Open cart, 1 item"` / `"Open cart"` when empty. (The default header today has **no** aria-label — this is a small a11y *improvement*, not a regression.) |
| Popup semantics | `aria-haspopup="dialog"` (the `<CartDrawer>` is a Radix `Sheet` = dialog). |
| Badge announcement | The badge `<span>` is `aria-hidden="true"` because the count is already in the button's `aria-label`; this avoids a double announcement. **Live updates** are conveyed by the changing `aria-label` (SR re-reads the button on focus). |
| Optional `aria-live` (per role instruction #2) | If a live count announcement is desired even without focus, add a **visually-hidden** `<span className="sr-only" aria-live="polite" aria-atomic="true">{item_count} items in cart</span>` *as a sibling inside the button*, and keep the visual badge `aria-hidden`. **Decision:** include the `sr-only aria-live` span (matches the instruction's explicit "aria-live on the badge count"). Use `polite` (not `assertive`) so add-to-cart doesn't interrupt. This is the canonical output; §2.2's snippet is the visual core and the `sr-only` live region is appended:
```tsx
<span className="sr-only" aria-live="polite" aria-atomic="true">
  {item_count === 0 ? 'Cart empty' : `${item_count} ${item_count === 1 ? 'item' : 'items'} in cart`}
</span>
```
| Focus visibility | Inherits Tailwind focus styles; do not remove outline. Tenant CSS may restyle the surrounding marker but the button keeps its own focus ring. |
| Contrast | Badge colors come from `branding.menuCartBadgeBackground/Text` (already passed through `sanitizeCSSColor`, `branding-utils.ts:188-189`); superadmin owns the contrast choice as today. |

---

## 3. Portal lifecycle (detailed)

This section is the contract the architecture doc's `<CustomHeader>` (§2.1/§3) must implement. It refines the mechanism and pins down every edge case.

### 3.1 Happy path (ordering with React 19 + manually-set innerHTML)

1. `<CustomHeader>` sanitizes `html` → `sanitizedHtml = useMemo(() => sanitizeChromeHtml(html), [html])`.
2. Renders the container with `dangerouslySetInnerHTML={{ __html: sanitizedHtml }}`. React writes the marker-containing HTML into the container's `innerHTML` **during the commit phase**.
3. A layout effect (runs **after** commit, so the DOM is populated) queries the container for the cart marker:
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
4. Once `mountNode` is set, `{mountNode && createPortal(<CartTriggerButton .../>, mountNode)}` mounts the live React button **as a child of the marker element**.

**React 19 ordering guarantee:** `dangerouslySetInnerHTML` populates `innerHTML` in the commit phase; `useLayoutEffect`/`useEffect` both run *after* commit. So the marker is guaranteed present in the DOM when the effect's `querySelector` runs (assuming the sanitized HTML contains it). `createPortal` into a *currently-attached* DOM node is the supported pattern; React owns the portal subtree, the browser owns the surrounding innerHTML, and they do not conflict because the marker is left empty (React only appends its own children to it). This is the same "portal into a node React doesn't otherwise manage" pattern that is officially supported.

**`useLayoutEffect` vs `useEffect`:** prefer `useLayoutEffect` (mount portal before paint → no one-frame flash of a marker-less header). Guard SSR with a `useIsomorphicLayoutEffect` shim (`= typeof window !== 'undefined' ? useLayoutEffect : useEffect`) to silence the SSR warning; `MenuClient` is `'use client'` but may still SSR. `useEffect` is an acceptable fallback (one extra frame).

### 3.2 Mount node ABSENT → fail closed to the default header

This is the load-bearing safety rule and it **matches `01-architecture.md` §3.6 (chosen option (a): a header missing its cart mount is invalid → fall back entirely)**. Confirmed and adopted.

- When the effect finds no `[data-wn-cart-mount]`, set `markerMissing = true`.
- `<CustomHeader>` renders its `fallback` prop (the `<DefaultHeader>`) **on the next render** when `markerMissing` is true:
  ```ts
  if (markerMissing) return <>{fallback}</>  // fallback = <DefaultHeader {...defaultHeaderProps} />
  ```
- **Why fail closed and not "floating button":** without the marker there is nowhere to wire the cart, and inventing a floating/overlay button would (a) be unplaceable relative to tenant layout and (b) violate "tenant defines the look". Falling back to the entire default header guarantees a working, well-placed cart with zero ambiguity. The cart is therefore reachable in EVERY code path:
  - custom header with valid marker → portaled `<CartTriggerButton>`,
  - custom header with missing marker → `<DefaultHeader>` (its built-in cart button),
  - custom header that throws during render/sanitize → `<CustomRegionBoundary>` fallback = `<DefaultHeader>` (`01-architecture.md` §5),
  - custom header disabled → `<DefaultHeader>`.
- **Save-time validation is the primary guard** (§7): reject HTML with ≠1 marker so this runtime path is rarely hit; the runtime fail-closed is defense in depth (covers HTML edited directly in DB or via a non-validating path).
- **Flash consideration:** if `useLayoutEffect` is used, the swap to `<DefaultHeader>` happens before paint when the marker is missing (no flash of a cart-less custom header). With `useEffect` there could be one frame of custom header without a cart button before fallback; acceptable but `useLayoutEffect` is preferred specifically to avoid it.

### 3.3 Multiple matches → first only

- `querySelector('[data-wn-cart-mount]')` returns the **first** match in document order; subsequent markers are ignored and stay empty. This is deterministic and matches the role instruction ("handling multiple matches (first only)").
- Save-time validation SHOULD reject >1 marker (a 2nd marker is almost certainly an authoring mistake and would leave an empty placeholder box). Runtime tolerates it gracefully (no second cart button, no error).
- Same first-match rule applies to the optional `data-wn-logo` / `data-wn-store-name` slots (§1.2).

### 3.4 Re-portal when the HTML changes

- The effect dependency is **`sanitizedHtml`** (not `html`): when the tenant string changes, the memo recomputes, React re-commits new `innerHTML`, then the effect re-runs and re-queries the **new** marker node.
- Sequence on HTML change: cleanup of the old effect runs → `setMountNode(null)` → React unmounts the old portal (tears down the old `<CartTriggerButton>` and removes its DOM) → React commits the new `innerHTML` (replacing the old marker element entirely) → re-run effect finds the new marker → `setMountNode(newEl)` → portal re-mounts into the new node. No dangling DOM, no double-mount, no stale node reference (the old `mountNode` is discarded; we never portal into a detached node because `setMountNode(null)` fired first).
- This is exercised in dev when superadmin saves new HTML and `router.refresh()`/`revalidatePath` re-renders with new props, and is the reason `01-architecture.md` §5 keys the boundary by the html string (a *throwing* new HTML remounts the boundary; a *valid* new HTML re-portals via this effect).

### 3.5 Teardown

- **On HTML change:** old portal unmounted via `setMountNode(null)` cleanup (above) before new innerHTML is written.
- **On `<CustomHeader>` unmount** (toggle back to default, route change, marker-missing fallback render): React unmounts the component subtree, which unmounts the portal (`<CartTriggerButton>` removed, its event listeners gone) and discards the container `<div>` with its innerHTML. Standard React teardown; nothing manual required.
- **No leaked nodes/listeners:** the only DOM the platform created is the portaled button (React-managed → auto-removed) and the container (React-managed → auto-removed). The tenant innerHTML lives inside the container, so it dies with the container.

**Why internal `useCart()` is the robust choice for teardown/reactivity (resolves §0 conflict):** the portaled `<CartTriggerButton>` is a React child of `<CustomHeader>`. Its re-renders are driven by *its own* context subscription, independent of whether `MenuClient` re-created the element. If we instead passed `itemCount` as a prop (architecture doc's chosen variant), the button would only update when `MenuClient` re-renders AND passes a fresh element into the portal — which it does today, but couples the badge's liveness to `MenuClient`'s render graph and to `MenuClient` continuing to destructure `item_count`. Reading `useCart()` inside the portaled component removes that coupling: the badge re-renders on context change with zero dependence on the host's props. Both work today; the internal-`useCart` variant is strictly safer for a portaled subtree and is what the role instruction mandates.

### 3.6 Multi-marker portals (cart + optional slots)

When the optional slots ship, the same effect queries all three markers and `createPortal`s into each present node:

```ts
useIsomorphicLayoutEffect(() => {
  const root = containerRef.current
  if (!root) return
  setMountNodes({
    cart: root.querySelector('[data-wn-cart-mount]'),
    logo: root.querySelector('[data-wn-logo]'),
    storeName: root.querySelector('[data-wn-store-name]'),
  })
  // markerMissing is driven ONLY by cart === null (slots are non-load-bearing)
  setMarkerMissing(!root.querySelector('[data-wn-cart-mount]'))
  return () => setMountNodes({ cart: null, logo: null, storeName: null })
}, [sanitizedHtml])
```

Then render `cart && createPortal(<CartTriggerButton/>, cart)`, `logo && createPortal(<LogoSlot/>, logo)`, `storeName && createPortal(<StoreNameSlot/>, storeName)`. Each portal is independent; a missing slot simply skips its portal. Only the cart's absence triggers fail-closed.

### 3.7 React StrictMode double-invoke safety

- **StrictMode double-invokes** component bodies and effects (mount → cleanup → mount) in dev only. The effect here is idempotent: each run does `querySelector` + `setMountNode`/`setMarkerMissing`; the cleanup does `setMountNode(null)`. Double-invoke yields: set node → set null → set node again. The portal mounts/unmounts/mounts; net result is one mounted portal. No duplicate buttons, no leaked listeners (each cleanup removes the prior portal).
- **`querySelector` is side-effect-free**, so re-running it is harmless.
- **`useMemo(sanitizeChromeHtml)` double-invoke:** the sanitizer must be a **pure function** (no shared mutable state) so StrictMode's double call is safe — restated as a contract to the security agent (§7).
- **No reliance on effect-run-count:** we never assume the effect runs exactly once. State is derived purely from the current DOM each run, so StrictMode (or React's future double-render behaviors) cannot corrupt it.
- **`createPortal` is not double-mounted in prod:** prod runs effects once; the StrictMode concern is dev-only and handled by idempotency above.

---

## 4. What stays UNCHANGED in `MenuClient` (and why the cart still works)

The custom-header feature touches the *trigger's location* only. Everything that makes the cart *function* is outside the custom region and is **not modified**.

| Thing | Location | Status | Why it's safe |
|---|---|---|---|
| Drawer open state | `const [isCartOpen, setIsCartOpen] = useState(false)` (`menu-client.tsx:93`) | **UNCHANGED** | The portaled `<CartTriggerButton onOpen={() => setIsCartOpen(true)}>` toggles the exact same state the default header toggles. |
| Tenant context wiring | `useEffect(() => { if (tenant) setTenantContext(tenant.id, tenant.slug) }, [tenant, setTenantContext])` (`menu-client.tsx:98-102`) | **UNCHANGED** | Cart operations need `tenantId`/`tenantSlug` in context; this effect still runs identically. Custom header does not touch it. |
| `<CartDrawer>` mount | `<CartDrawer open={isCartOpen} onClose={() => setIsCartOpen(false)} ... />` (`menu-client.tsx:699-710`) | **UNCHANGED** | The drawer is a sibling of the header, renders to `document.body` via Radix `Sheet` portal — **never inside the header DOM**. Custom header innerHTML cannot reach it. |
| Add / remove / update qty | Inside `<CartDrawer>` via `useCart()` (`cart-drawer.tsx:61`: `updateQuantity`, `removeItem`, `removeBundleFromCart`, `updateBundleQuantity`; +/- at `:106-139`, confirm-remove `:115-124`) | **UNCHANGED** | These are drawer-internal and consume `useCart` directly. The custom header only adds a *trigger*; it does not participate in item mutation at all. |
| Checkout | `<CartDrawer>` `handleCheckoutClick` → `router.push('/<slug>/checkout')` or upsell interstitial (`cart-drawer.tsx:90-104`) | **UNCHANGED** | Lives entirely in the drawer. |
| `addItem` from menu cards | `MenuClient` passes `addItem` (from `useCart`, `menu-client.tsx:76`) down to product cards | **UNCHANGED** | Add-to-cart from the grid is unrelated to the header; still works, and its result flows to the badge via context. |

**Net contract:** the ONLY change in `MenuClient`'s cart wiring is *where the trigger is rendered* (portaled into custom HTML vs inline in `<DefaultHeader>`). The open-state, the drawer, the context, and all mutations are byte-for-byte unchanged. This is why every cart capability is preserved by construction.

---

## 5. End-to-end runtime trace (custom header attached, valid marker)

| # | Step | What happens | Where it's handled |
|---|---|---|---|
| 1 | Customer loads `/<tenant>/menu` | SSR: `menu-server.tsx` `.select(...)` returns the 4 new columns (allowlist, `01-architecture.md` §4.2) → `tenant.custom_header_enabled === true`, `custom_header_html` non-empty. Page renders `<MenuClient tenant=...>`. | `menu-server.tsx`, `page.tsx` (unchanged) |
| 2 | `MenuClient` mounts | `customHeaderEnabled` gate true → renders `<CustomRegionBoundary fallback={<DefaultHeader/>}><CustomHeader html=... cartTrigger={<CartTriggerButton onOpen={() => setIsCartOpen(true)} badgeBg=.. badgeText=../>}/></CustomRegionBoundary>`. `setTenantContext(tenant.id, tenant.slug)` runs (`:98-102`). | `menu-client.tsx` §1a + `01-arch` §1a |
| 3 | Header HTML renders | `<CustomHeader>` sanitizes → `dangerouslySetInnerHTML` writes tenant chrome (with `--brand-*` vars on the wrapper). Layout effect finds `[data-wn-cart-mount]`, sets `mountNode`. | `custom-header.tsx` §3.1 |
| 4 | Cart badge appears | `createPortal(<CartTriggerButton/>, mountNode)`. `<CartTriggerButton>` calls `useCart()`, reads `item_count` (e.g. from persisted localStorage cart → maybe already > 0). Badge shows count; if 0, no badge. | `cart-trigger-button.tsx` §2 |
| 5 | Customer clicks the cart | `onClick={onOpen}` → `setIsCartOpen(true)` (the SAME `:93` state). | `cart-trigger-button.tsx` → `menu-client.tsx:93` |
| 6 | Drawer opens | `isCartOpen=true` → `<CartDrawer open>` (`:699`) renders via Radix Sheet into `document.body`. Prefetches checkout + upsells (`cart-drawer.tsx:71-88`). | `cart-drawer.tsx` (unchanged) |
| 7 | Customer adds an item (from drawer upsell or menu grid) / changes qty / removes | `addItem` / `updateQuantity` / `removeItem` mutate `items`/`bundleItems` in `CartProvider` → new context value (`useCart.tsx:725`). | `useCart.tsx`, `cart-drawer.tsx:106-139` (unchanged) |
| 8 | Badge updates live | New context value → `<CartTriggerButton>` (a `useCart()` consumer) re-renders → `item_count` recomputed (`item_count` memo `useCart.tsx:721`) → badge number/visibility update on the same commit as the drawer line items. | `cart-trigger-button.tsx` §2.3 |
| 9 | Customer taps Checkout | `<CartDrawer>` `handleCheckoutClick` → (interstitial or) `router.push('/<slug>/checkout')` (`:90-104`). | `cart-drawer.tsx` (unchanged) |
| 10 | (Edge) HTML missing marker | Step 3's effect finds no marker → `markerMissing=true` → `<CustomHeader>` returns `<DefaultHeader/>` → its built-in cart button drives steps 5–9 identically. | §3.2 |
| 11 | (Edge) Custom header throws | `<CustomRegionBoundary>` catches → renders `<DefaultHeader/>` → cart works identically. | `01-arch` §5 |

**Invariant proven by the trace:** at steps 5–9 the cart's open/add/remove/qty/badge/checkout behavior is identical whether the trigger came from the portaled `<CartTriggerButton>` (custom header) or the inline button (`<DefaultHeader>`), because both call the same `setIsCartOpen` and the same `<CartDrawer>`/`useCart`.

---

## 6. Phase-4 integration-test assertions

Tests live in `tests/unit/components/` (jsdom, `@/`→`src/`, `npm run test -- --testPathPattern="custom-header"` / `"cart-trigger"`). Render `<CartProvider><MenuClient tenant={fixtureWithCustomHeader} .../></CartProvider>` (or a thin harness mounting `<CustomHeader>` with a real `<CartProvider>` + a spy `onOpen`). Assertions:

### 6.1 Marker / portal mechanics
- **A1 — marker found & portaled:** given header HTML containing `<div data-wn-cart-mount></div>`, after render a `<button>` with `aria-label` matching `/open cart/i` exists **as a descendant of the `data-wn-cart-mount` element**.
- **A2 — exactly-one / first-match:** given HTML with two `data-wn-cart-mount` elements, exactly **one** cart button renders, and it is inside the **first** marker (second stays empty).
- **A3 — marker missing → fail closed:** given valid-but-marker-less custom header HTML, the rendered header is the **default header** (assert a default-header-only signal, e.g. the store-name `<h1>` from `DefaultHeader`, AND a working cart button exists). The custom HTML's distinctive sentinel (e.g. a `data-testid` the tenant put in) is **absent**.
- **A4 — re-portal on HTML change:** rerender with new header HTML (different marker element) → exactly one cart button, now inside the new marker; no orphan button from the old HTML remains in the DOM.
- **A5 — teardown:** unmount → no cart button remains; no error thrown.
- **A6 — StrictMode safety:** wrap render in `<React.StrictMode>` → still exactly one cart button (no duplicate from double-invoked effect).

### 6.2 Badge reflects `item_count`
- **A7 — empty cart hides badge:** with an empty cart, the cart button renders but the numeric badge `<span>` is **absent** (`item_count > 0` gate).
- **A8 — badge equals item_count:** after `addItem(x, ..., 3)`, the badge text is `"3"` and the button `aria-label` contains `"3 items"`.
- **A9 — badge clamps at 99+:** with `item_count > 99`, badge text is `"99+"`.
- **A10 — badge counts bundles:** adding a bundle (`addBundleToCart`) updates the badge per `getFullCartItemCount` (slot qty × bundle qty), proving it uses the same count path as the default header.
- **A11 — badge updates on remove/qty change:** after `addItem` then `updateQuantity(id, 1)` then `removeItem(id)`, the badge text tracks each change (e.g. `3 → 1 → absent`).

### 6.3 Click opens the same drawer
- **A12 — click calls open:** clicking the portaled cart button calls the `onOpen` spy exactly once (unit), OR (integration) flips `isCartOpen` so the `<CartDrawer>` `Sheet` becomes `open` (assert the drawer's `role="dialog"` / "Your Cart" title appears).
- **A13 — keyboard activation:** pressing Enter/Space on the focused cart button triggers `onOpen` (native button behavior; assert via `userEvent.keyboard`).

### 6.4 Drawer mutations work with custom header attached
- **A14 — qty +/- in drawer:** open the drawer (with custom header attached), click the increment/decrement controls → `updateQuantity` runs, line item qty changes, AND the header badge (portaled button) reflects the new count.
- **A15 — remove in drawer:** trigger remove (confirm dialog → confirm) → `removeItem` runs, item gone from drawer, badge decrements/hides.
- **A16 — checkout from drawer:** click Checkout → `router.push('/<slug>/checkout')` (mock `useRouter`, assert `push` called with `/<slug>/checkout`) when interstitial disabled; or interstitial opens when enabled.
- **A17 — drawer is outside header DOM:** assert the `<CartDrawer>` content (Radix Sheet) is **not** a descendant of the `data-wn-custom-header` container (it portals to `document.body`), proving custom HTML cannot affect cart internals.

### 6.5 Accessibility
- **A18 — accessible name:** cart button has a non-empty accessible name containing "cart" and the count when > 0.
- **A19 — popup semantics:** cart button has `aria-haspopup="dialog"`.
- **A20 — live region present:** an `aria-live="polite"` region announcing the count exists inside the button, and the visual badge is `aria-hidden`.

### 6.6 Independence / non-regression
- **A21 — default path unchanged:** with `custom_header_enabled` false (or columns undefined), `<DefaultHeader>` renders and its cart button works (snapshot/behavior parity with pre-feature behavior).
- **A22 — hero failure does not affect header cart:** with a custom header (valid) AND a custom hero that throws, the header cart button still renders and works (independent boundaries, `01-arch` §5).
- **A23 — sanitizer-stripped handlers don't break cart:** header HTML whose tenant markup includes a fake `<button onclick="...">` (which the sanitizer strips) still yields exactly one working cart button (the platform's), and the tenant's inert button does nothing.

---

## 7. Contracts handed to / required from other agents

1. **Security agent (sanitizer) — HARD requirements for cart integration:**
   - `sanitizeChromeHtml(html: string): string` MUST be a **pure function** (StrictMode double-invoke safety, §3.7).
   - MUST **preserve** `data-wn-cart-mount` and all `data-wn-*` attributes (cart marker + future slots) — do not strip them as "unknown attributes".
   - MUST preserve the **element** carrying the marker (don't drop empty `<div>`/`<span>`).
   - MUST NOT inject content into the marker (it stays empty for the portal).
2. **Persistence agent (save-time validation):**
   - Reject header HTML that does not contain **exactly one** `[data-wn-cart-mount]` (Zod `.refine`, count after sanitize). This is the primary guard backing the runtime fail-closed (§3.2).
   - SHOULD reject the marker being on `<a>`/`<button>` (nested-interactive, §1.1) and SHOULD warn if the marker element is non-empty.
   - Run the same `sanitizeChromeHtml` at save (store raw recommended; render always re-sanitizes).
   - On save: `revalidatePath('/<slug>/menu','layout')` + `invalidateTenantCache(slug, tenantId)`.
3. **UI agent (superadmin form):** surface the §1.3 marker table as author help text in the editor; the preview can render `<CustomHeader>` with a stub `cartTrigger` (a dummy button) so the superadmin sees marker placement. The required-marker rule should be shown inline (e.g. "Your header HTML must include exactly one `<div data-wn-cart-mount></div>` where the cart button will appear").
4. **Architecture agent (`<CustomHeader>` shell):** implement the portal lifecycle exactly per §3; adopt this doc's `<CartTriggerButton>` prop shape (§2.1, no `itemCount`); keep `markerMissing → fallback` (§3.2).

---

## 8. Summary — the one-paragraph guarantee

The custom header HTML defines only *look*. Its single load-bearing contract is one empty element marked `data-wn-cart-mount`, into which the platform `createPortal`s a real React `<CartTriggerButton>` that reads `item_count` from `useCart()` and calls `setIsCartOpen(true)` — the exact same state and drawer the default header uses. The drawer, its add/remove/qty/checkout logic, the cart context, and the open-state all live **outside** the custom region and are unchanged. If the marker is missing or the header throws, the whole header fails closed to `<DefaultHeader>`, which has its own working cart. Therefore a functional cart (open/close, add, remove, qty, badge, checkout) is guaranteed in every code path, with no XSS surface added (the only interactive element is platform React, not tenant markup).
