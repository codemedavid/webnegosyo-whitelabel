# TDD evidence — the page background image never appears

**Source plan:** none. Derived from a merchant report: the background image saves in the
Branding Studio but shows up neither on the storefront nor in the editor preview, and
changing the options makes no difference.

## Root cause

A CSS stacking bug — the data, the save, and the render were all fine.

Verified against production (`luckyjoy`): the row holds the image
(`background_image_url`, opacity 50, fit `repeat`, tint `#fff8ec` @ 10%), and both layers
are present in the SSR HTML of `https://luckyjoy.webnegosyo.com/menu`:

```html
<div class="storefront-themed min-h-screen" style="…;background-color:#FFF8EC">
  <div data-testid="background-image-layer"   style="position:fixed;inset:0;z-index:-1;…"></div>
  <div data-testid="background-overlay-layer" style="position:fixed;inset:0;z-index:-1;…"></div>
```

`z-index: -1` paints a child above its parent's own background **only when that parent
establishes a stacking context**. The storefront root sets no `position`, `z-index`,
`transform`, `opacity` or `isolation`, so it creates none — the layers fell through to the
root stacking context and were painted *underneath* the root's opaque
`background-color: #FFF8EC`. Rendered, composited, and completely hidden. The comment on
`BackgroundOverlayLayer` asserted the opposite ("paints them above the parent's background
color"), which is why it read as correct.

`src/components/customer/product-detail-content.tsx` had the identical shape: the layers
sit inside a `<main>` painting `var(--pd-page-background)`.

This is also why the Branding Studio preview looked broken — it renders the real
storefront in an iframe, so it inherited the same bug, and why editing fit/position/tint
changed nothing: every variant was hidden by the same opaque color.

Reduced repro (production markup, two files differing only in the root style), rendered
with headless Chrome:

| Root style | Result |
| --- | --- |
| *(none)* | Plain `#FFF8EC` page — image and tint invisible |
| `isolation: isolate` | Tiled image at 50% opacity under the tint, content on top |

## User journeys

1. As a merchant, when I set a page background, I want to see it on my storefront and in
   the editor preview.
2. As a merchant, I want fit / position / opacity / tint to visibly change the result.
3. As a merchant who has never touched this feature, I want my storefront to render
   exactly as before.

## Task report

### 1. Reproducer first (RED)

Extended `tests/unit/background-overlay-wiring.test.ts` — the existing guardrail suite for
this feature — with a `background overlay stacking` block: a behavioural spec for a new
`buildBackgroundRootStyle`, plus source-level assertions that both mount sites apply it.
The mount-site checks are source-level because the alternative is rendering the whole
storefront (`menu-client` / `product-detail-content`) in jsdom.

RED — `npx jest tests/unit/background-overlay-wiring.test.ts`:

```
● background overlay stacking › src/app/[tenant]/menu/menu-client.tsx isolates the root …
● background overlay stacking › src/components/customer/product-detail-content.tsx isolates …
● background overlay stacking › isolates the root so a negative-z layer clears the opaque page color
    TypeError: (0 , _backgroundoverlay.buildBackgroundRootStyle) is not a function
● background overlay stacking › leaves the root untouched for a tenant with no background configured
● background overlay stacking › isolates for a tint-only background too

Tests: 5 failed, 26 passed, 31 total
```

### 2. Give the layers a stacking context (GREEN)

- `src/lib/background-overlay.ts` — new pure `buildBackgroundRootStyle(background)`,
  returning `{ isolation: 'isolate' }` when a background is visible and `{}` otherwise.
  `isolation` creates a stacking context with no layout or paint effect of its own, so the
  page color stays the base layer and the image composites over it.
- `menu-client.tsx` — spreads it into the storefront root style.
- `product-detail-content.tsx` — spreads it into `<main>`, gated on `!isSheet` to match the
  existing condition on the layer itself (in sheet mode the storefront underneath already
  paints the background).

Returning `{}` for unconfigured tenants means **zero** change for every storefront that
does not use the feature — the blast radius of the new stacking context is exactly the
tenants who asked for a background.

GREEN — `npx jest tests/unit/background-overlay-wiring.test.ts`: 31 passed.

### 3. Regression check

Background + branding + upload suites: 5 suites, 71 tests, all passing. Full run:
210 of 212 suites pass; the two failures (`webnegosyo-app/lib/printer-native-load.test.ts`,
`webnegosyo-app/lib/order-item-images.test.ts`) are pre-existing and unrelated.
`tsc --noEmit` reports no error under `src/`; `eslint` clean on all four touched files.

## Known limitation — "Scroll behaviour" is currently inert

Both layers are `position: fixed` covering the viewport, so `background-attachment: scroll`
and `fixed` paint identically — the image never scrolls with the page. Making `scroll`
behave differently means spanning the layer over the whole document
(`position: absolute` against a positioned root) rather than the viewport, which changes
the containing block for every absolutely-positioned descendant in the storefront. Left
as-is deliberately; not attempted as part of this fix.
