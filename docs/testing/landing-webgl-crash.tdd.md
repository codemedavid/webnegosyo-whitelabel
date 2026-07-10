# TDD Evidence — Landing page WebGL crash (`i.canvas[a]`)

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from a
production incident report: `www.webnegosyo.com` rendered a full-page black
"Application error: a client-side exception has occurred" screen. Console:

```
TypeError: undefined is not an object (evaluating 'i.canvas[a]')
```

(The 28 `.js.map` 404s in the same console dump are unrelated source-map noise —
production ships without public source maps — and are not part of this fix.)

## Root cause

`src/components/landing/landing-page.tsx` renders a decorative 3D WebGL hero
(`HeroCanvas` → `@react-three/fiber` `<Canvas>` + Three.js r0.180) with **no error
boundary** around it. When the Three.js `WebGLRenderer` fails on the client
(WebGL disabled/unsupported, lost GPU context, or an init throw — the minified
`i.canvas[a]` access), the exception propagates through React commit up to
`src/app/global-error.tsx`, which is the black screen users saw. A decorative
background must never be able to take down the marketing site.

## User journeys

- As a visitor whose browser cannot initialise WebGL, I want the landing page to
  still render its content with a static background, so I never see a full-page
  error screen.
- As a visitor on a healthy browser, I want the 3D hero to render unchanged.

## Task report

| Behavior | Validation command | RED → GREEN |
|----------|--------------------|-------------|
| Scene failure is isolated behind a boundary that shows a static fallback | `npx jest tests/unit/scene-error-boundary.test.tsx` | RED: `Cannot find module '.../scene-error-boundary'` → GREEN: 4/4 pass |
| Landing page wires the boundary around `HeroCanvas` with `StaticSceneFallback` | `npx eslint …/landing-page.tsx` + `tsc --noEmit` | lint exit 0, no new type errors |

RED excerpt:

```
Cannot find module '../../src/components/landing/scene-error-boundary'
Test Suites: 1 failed, 1 total
```

GREEN excerpt:

```
PASS tests/unit/scene-error-boundary.test.tsx
Tests: 4 passed, 4 total
```

Regression sweep (`npx jest scene-error-boundary hero`): **255 passed**.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Boundary renders children when nothing throws (healthy WebGL path) | `scene-error-boundary.test.tsx:renders children when nothing throws` | unit | PASS |
| 2 | Boundary shows the fallback when a child throws the `i.canvas[a]` error | `…:renders the fallback when a child throws a WebGL/Three error` | unit | PASS |
| 3 | The throw does not propagate — sibling page content keeps rendering | `…:does not rethrow — sibling content around the boundary keeps rendering` | unit | PASS |
| 4 | With no fallback, a child throw yields empty DOM, not a crash | `…:renders nothing (not a crash) when no fallback is provided` | unit | PASS |

## Coverage and known gaps

- Error boundaries catch errors thrown during render/commit — which is where the
  reported `i.canvas[a]` crash occurs (React commit phase in the stack trace).
- **Gap:** React error boundaries do **not** catch errors thrown in async
  callbacks such as the `requestAnimationFrame` render loop. If a future crash
  originates there, it needs a separate guard (e.g. R3F `onCreated` / a WebGL
  context-loss listener). Not observed in this incident.
- The fix is behavior-preserving for the healthy path: the 3D hero renders
  exactly as before; only the failure path changed (black screen → static
  gradient fallback).
