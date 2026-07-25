# TDD evidence — custom page background image + overlay

**Source plan:** none. Journeys were derived during this TDD run from the request
"add background overlay on the website … custom image and adjust opacity and overlay".

**Scope (confirmed with the user):** storefront menu page + product detail page;
image supplied by upload (ImageKit) *or* pasted URL.

## User journeys

1. As a merchant, I want to upload a custom background image for my storefront, so my
   menu page reflects my brand beyond flat colors.
2. As a merchant, I want to dial the image's opacity, so the background does not
   overpower the menu content.
3. As a merchant, I want to lay a tint (color + opacity) over the background image, so
   text stays readable over a busy photo.
4. As a merchant, I want to control how the image sits (cover / contain / repeat,
   position, fixed vs scrolling), so it looks right on both phone and desktop.
5. As a merchant who never touches this, I want my storefront to look exactly as before.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Pure resolver | `resolveBackgroundOverlay` + style builders read seven tenant columns and degrade safely | `npx jest --testPathPatterns="background-overlay"` | RED (module not found) → GREEN, 33 tests |
| Render layer | `BackgroundOverlayLayer` renders two decorative fixed layers, or nothing | same | RED → GREEN, 7 tests |
| Editor field | New `image` field type (upload + paste + clear) in the Branding Studio | `npx jest --testPathPatterns="branding-image-row"` | RED (3 of 4 failed) → GREEN, 4 tests |
| Wiring guardrail | Columns present in storefront SELECT, registry, Zod schema and the rollout-tolerant list | `npx jest --testPathPatterns="background-overlay-wiring"` | RED → GREEN, 27 tests |
| Persistence | Migration `20260725140000_page_background_overlay.sql` adds the seven nullable columns + range/enum CHECKs | not applied yet — see gaps | n/a |

### RED evidence

```
FAIL tests/unit/background-overlay.test.ts
  ● Test suite failed to run
    Cannot find module '@/lib/background-overlay' from 'tests/unit/background-overlay.test.ts'
FAIL tests/unit/components/customer/background-overlay-layer.test.tsx
    Cannot find module '.../src/components/customer/background-overlay-layer'
Test Suites: 3 failed, 3 total
```

```
FAIL tests/unit/branding-image-row.test.tsx
  ● FieldRow — image › clears the value when removed
    Unable to find an accessible element with the role "button" and name "Remove image"
Tests: 3 failed, 1 passed, 4 total
```

Committed as `9f33e42 test: add reproducer for storefront background image + overlay`.

### GREEN evidence

```
PASS tests/unit/background-overlay-wiring.test.ts
PASS tests/unit/branding-image-row.test.tsx
PASS tests/unit/components/customer/background-overlay-layer.test.tsx
PASS tests/unit/background-overlay.test.ts
Test Suites: 4 passed, 4 total
Tests:       61 passed, 61 total
```

Full suite: `npm run test` → `Test Suites: 2 failed, 185 passed`; both failures
(`webnegosyo-app/lib/printer-native-load`, `webnegosyo-app/lib/order-item-images`) are
pre-existing and reproduce on the untouched baseline.

`npm run lint` → no new errors or warnings in any touched file.
`npx tsc --noEmit` → no errors under `src/`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A tenant with no background columns renders no extra layers (zero regression) | `background-overlay.test.ts:stays invisible for a tenant with no background fields set` | unit | PASS |
| 2 | An image URL alone yields cover / no-repeat / center / scroll / full opacity | `background-overlay.test.ts:enables the image layer with sensible defaults` | unit | PASS |
| 3 | `javascript:` and CSS-metacharacter URLs never reach the stylesheet | `background-overlay.test.ts:rejects a javascript: image URL`, `…rejects an image URL containing CSS-breaking characters` | unit | PASS |
| 4 | Opacity percents convert to 0..1 and clamp; garbage falls back | `background-overlay.test.ts:clamps out-of-range image opacity…`, `…parses a numeric-string opacity` | unit | PASS |
| 5 | `repeat` fit tiles the image; unknown fit falls back to cover | `background-overlay.test.ts:maps the repeat fit…`, `…falls back to cover for an unknown fit` | unit | PASS |
| 6 | A zero overlay opacity renders no tint layer at all | `background-overlay.test.ts:treats a zero overlay opacity as no overlay layer` | unit | PASS |
| 7 | A tint works with no image at all | `background-overlay.test.ts:allows an overlay tint with no image` | unit | PASS |
| 8 | Invalid overlay colors fall back to black instead of injecting CSS | `background-overlay.test.ts:falls back to black for an invalid overlay color` | unit | PASS |
| 9 | Overlay renders as `rgba()`, including 3-digit hex expansion | `background-overlay.test.ts:builds an rgba() tint…`, `…expands a 3-digit hex` | unit | PASS |
| 10 | Layers are decorative: `aria-hidden`, `pointer-events: none`, fixed behind content | `background-overlay-layer.test.tsx:hides the decorative layers…` | component | PASS |
| 11 | Every column is selected by the storefront query, in the registry, and rollout-tolerant | `background-overlay-wiring.test.ts` (3 × 7 parameterized cases) | integration | PASS |
| 12 | The Zod schema accepts a full payload, accepts clearing the URL, rejects >100 opacity and unknown fits | `background-overlay-wiring.test.ts:accepts a full background overlay payload` + 3 | integration | PASS |
| 13 | The editor field uploads, accepts a pasted URL, and clears | `branding-image-row.test.tsx` (4 cases) | component | PASS |

## Coverage

```
npx jest --testPathPatterns="background-overlay|branding-image-row" --coverage \
  --collectCoverageFrom="src/lib/background-overlay.ts" \
  --collectCoverageFrom="src/components/customer/background-overlay-layer.tsx"

background-overlay-layer.tsx | 100 | 100   | 100 | 100
background-overlay.ts        | 100 | 97.77 | 100 | 100  (line 78: non-string opacity branch)
```

## Known gaps

- **The migration has not been applied.** Until
  `supabase/migrations/20260725140000_page_background_overlay.sql` runs, saves silently
  drop these seven fields — `ROLLOUT_DEPENDENT_FIELDS` makes the rest of branding still
  persist (covered by test #11), but the feature is inert.
- No E2E/visual test. The z-index layering (`position: fixed; z-index: -1` painting above
  the parent background and below content) is asserted only through inline styles in JSDOM;
  it should be eyeballed once on a real storefront after the migration.
- The mobile apps (`mobile/`, `webnegosyo-app/`) do not read these columns — web only.
