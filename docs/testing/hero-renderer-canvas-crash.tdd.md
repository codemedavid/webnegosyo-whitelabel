# TDD Evidence — HeroRenderer canvas crash

**Source plan:** none — journey derived during this TDD run from a runtime error report.

## Bug

Recoverable server-render error:

```
Cannot read properties of undefined (reading 'desktop')
  at CanvasView (src/components/customer/hero-renderer.tsx:611)
  const height = design.canvas[breakpoint]?.height ?? design.canvas.desktop.height
```

### Root cause

`src/components/customer/storefront-hero.tsx:79` passes a persisted `tenant.hero_design`
straight to `HeroRenderer` (only skipping `version === 4` block heroes) **without migration
or schema validation**. A legacy or partial design missing `canvas` — or missing the
`canvas.desktop` breakpoint — reaches `CanvasView`, where `design.canvas.desktop.height`
throws during SSR, forcing a fallback to client rendering.

## User journeys

- As a customer visiting a storefront whose merchant has a legacy/partial `hero_design`,
  I want the page to render without a server error, so the menu still loads.
- As a merchant with a well-formed hero design, I want it to keep rendering unchanged.

## Task report

Made `CanvasView` tolerate a missing/partial canvas via `resolveCanvasHeight()`
(breakpoint height → desktop height → `FALLBACK_CANVAS_HEIGHT`) and guarded
`design.elements` with `?? []`.

- **Validation command:** `npx jest tests/unit/hero-renderer-canvas.test.tsx`
- **RED:** 2 failed (`no canvas`, `missing desktop`) — `TypeError: Cannot read properties of undefined (reading 'height')` at hero-renderer.tsx:611; 1 passed (well-formed).
- **GREEN:** 3 passed after the fix.
- **Guaranteed:** HeroRenderer never throws on a canvas-less or partial-canvas design and still renders well-formed designs.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | Design with no `canvas` renders without throwing | `hero-renderer-canvas.test.tsx:does not throw when the design has no canvas at all` | unit | PASS | `npx jest hero-renderer-canvas` |
| 2 | Design whose `canvas` lacks `desktop` renders without throwing | `hero-renderer-canvas.test.tsx:does not throw when canvas is missing the desktop breakpoint` | unit | PASS | `npx jest hero-renderer-canvas` |
| 3 | Well-formed design still renders | `hero-renderer-canvas.test.tsx:renders normally for a well-formed design` | unit | PASS | `npx jest hero-renderer-canvas` |

## Coverage and known gaps

- Full hero suites green: `npx jest hero-renderer-canvas hero-block` → 215 passed.
- Lint clean on `src/components/customer/hero-renderer.tsx`.
- Intentional scope: fix lives at the shared renderer boundary (KISS) rather than adding
  migration to `storefront-hero.tsx` — `migrateDesign` itself assumes a present `canvas`,
  so hardening the single render consumer covers every caller. Backfilling/normalizing
  malformed persisted designs is a deferred follow-up.
