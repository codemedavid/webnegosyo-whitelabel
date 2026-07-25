# TDD Evidence — Landing Page Redesign

**Date:** 2026-07-25
**Branch:** `feat/unified-modifier-groups`
**Scope:** `src/components/landing/**`, `src/app/page.tsx`, `src/app/globals.css`

## Source plan

No `*.plan.md` was supplied. The user asked for a full landing-page redesign with
"more clarity of what we offer". Journeys below were derived during this run from
that request and from the gap analysis of the previous page (it never stated what
the product actually is).

## User journeys

| # | Journey |
|---|---------|
| J1 | As a food business owner landing on the page, I want to know in one sentence what the product is, so I do not have to guess. |
| J2 | As a visitor who is not ready to buy, I want a way to jump straight to what is included, so I can evaluate before paying. |
| J3 | As a visitor using the nav, I want every nav link to land on a real section, so navigation never silently breaks. |
| J4 | As a buyer, I want the full list of what I get and what it costs, so I can tell exactly what the one-time price covers. |
| J5 | As a visitor, I want the page to name the problems I actually have, so I recognise myself before being sold to. |
| J6 | As a visitor, I want to see what each upsell feature looks like, so "automatic upsells" is concrete instead of abstract. |
| J7 | As a visitor anywhere on the page, I want a persistent way to buy and a footer that reaches policy pages, so I am never stranded. |
| J8 | As a skeptical buyer, I want proof (numbers, demo, testimonials), so the claims are backed by something. |
| J9 | As a visitor, I want the page to build its case in order (problem → what you get → how it works → proof → price), so I understand the offer before I am asked to pay. |

## Task report

### 1. Clarity contract tests — genuine RED → GREEN

**Summary:** Wrote `tests/unit/landing-clarity.test.tsx` covering J1–J4, ran it
before changing anything else, and got a real failure.

**Validation command:**
```
npx jest --config jest.config.cjs tests/unit/landing-clarity.test.tsx
```

**RED output (excerpt):**
```
Tests:       6 failed, 10 passed, 16 total

  ● J4 — the offer is spelled out in full › renders every capability with a title and a description
    AggregateError:
    ReferenceError: IntersectionObserver is not defined
      at initIntersectionObserver (node_modules/framer-motion/.../feature-bundle.js:6123:34)
```

**Root cause:** jsdom ships no `IntersectionObserver`, which framer-motion
constructs for every `whileInView` animation. Any scroll-revealed section
therefore threw on render. Two of the six failures were defects in my own test
file (a dynamic `import()` inside a test body, which jest-circus rejects as a
nested hook).

**Fix:** Added an `IntersectionObserver` polyfill to `jest.setup.js`, directly
beside the pre-existing `ResizeObserver` polyfill that exists for the same
reason. No production code was changed to make these tests pass.

**GREEN output:**
```
Tests:       16 passed, 16 total
```

**Side effect (measured, not assumed):** the polyfill also repaired five
previously-failing tests elsewhere in the suite that render `whileInView`
components.

| Full-suite run | Failing suites | Failing tests |
|---|---|---|
| Without the polyfill | 5 | 8 |
| With the polyfill | 3 | 3 |

The 3 remaining failures are pre-existing and unrelated to this work
(`thermal-printer-native-absent`, and `webnegosyo-app/lib/order-item-images.test.ts`
which fails to run on a `mockFrom` initialisation order bug).

### 2. Section coverage tests — characterization, GREEN on first run

**Summary:** Wrote `tests/unit/landing-sections.test.tsx` (J5–J8) covering the
problem section, upsell feature rows and their UI mockups, nav/footer/marquee,
final CTA, and the proof section.

**Validation command:**
```
npx jest --config jest.config.cjs tests/unit/landing-sections.test.tsx
```

**Result:** `Tests: 19 passed, 19 total` — **passed on first run.**

These are regression/characterization tests, not a RED→GREEN cycle. The
production code they cover was written and verified in the browser earlier in
the same session, so there was no failing state to observe. Recorded here
honestly rather than manufacturing a RED.

### 3. Narrative order test — characterization, GREEN on first run

**Summary:** Wrote `tests/unit/landing-page-order.test.tsx` (J9) asserting every
narrative section renders exactly once and in the intended order. `next/dynamic`
is mocked so the WebGL hero canvas does not mount in jsdom.

**Validation command:**
```
npx jest --config jest.config.cjs tests/unit/landing-page-order.test.tsx
```

**Result:** `Tests: 2 passed, 2 total` — passed on first run.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | The hero states in plain language that the product is an ordering website | `landing-clarity.test.tsx:renders the plain-language product one-liner` | unit | PASS |
| 2 | The one-liner names "ordering website", not just "menu" | `landing-clarity.test.tsx:describes the product as an ordering website` | unit | PASS |
| 3 | The primary hero CTA points at `/checkout` | `landing-clarity.test.tsx:links the primary call to action to checkout` | unit | PASS |
| 4 | A secondary hero CTA jumps to the what-you-get section | `landing-clarity.test.tsx:offers a secondary call to action` | unit | PASS |
| 5 | Every nav anchor resolves to a section that actually exists | `landing-clarity.test.tsx:renders a section element for each nav anchor` | unit | PASS |
| 6 | Every nav target carries a scroll offset so the fixed nav does not cover its heading | `landing-clarity.test.tsx:offsets each anchor target` | unit | PASS |
| 7 | Every capability renders with both a title and a description | `landing-clarity.test.tsx:renders every capability` | unit | PASS |
| 8 | Every setup step renders | `landing-clarity.test.tsx:renders every setup step` | unit | PASS |
| 9 | Every pricing inclusion renders alongside the price | `landing-clarity.test.tsx:lists every pricing inclusion` | unit | PASS |
| 10 | The FAQ answers "what am I actually buying" | `landing-clarity.test.tsx:answers what the buyer is actually purchasing` | unit | PASS |
| 11 | No capability copy is blank and no title is duplicated | `landing-clarity.test.tsx:content invariants` | unit | PASS |
| 12 | FAQ disclosure exposes `aria-expanded` and reveals its answer on click | `landing-clarity.test.tsx:accessibility of the FAQ disclosure` | unit | PASS |
| 13 | Every reader problem renders with its explanation, resolving into the promise | `landing-sections.test.tsx:J5` | unit | PASS |
| 14 | Every upsell feature renders its label, headline and all selling points | `landing-sections.test.tsx:renders each feature with its label` | unit | PASS |
| 15 | Each upsell feature has a rendered UI preview; previews are `aria-hidden` | `landing-sections.test.tsx:J6` | unit | PASS |
| 16 | Header renders every nav link and keeps a checkout CTA | `landing-sections.test.tsx:J7` | unit | PASS |
| 17 | Footer links to `/privacy` and `/support` | `landing-sections.test.tsx:links the footer to the privacy and support pages` | unit | PASS |
| 18 | Final CTA goes to checkout; its secondary CTA goes to the FAQ | `landing-sections.test.tsx:J7` | unit | PASS |
| 19 | Every headline stat renders with its label | `landing-sections.test.tsx:renders every headline stat` | unit | PASS |
| 20 | The demo video is embedded and the testimonial disclaimer is retained | `landing-sections.test.tsx:J8` | unit | PASS |
| 21 | Every proof image has non-empty alt text | `landing-sections.test.tsx:gives every proof image alternative text` | unit | PASS |
| 22 | Every narrative section renders exactly once, in the intended order | `landing-page-order.test.tsx:J9` | unit | PASS |

Total: **37 tests, 37 passing.**

## Coverage

```
npx jest --config jest.config.cjs tests/unit/landing-*.test.tsx --coverage \
  --collectCoverageFrom='src/components/landing/**/*.{ts,tsx}'
```

Redesign surface (excluding WebGL scene files and the untouched checkout form):

```
All files | 98.43 % Stmts | 94.73 % Branch | 88.63 % Funcs | 98.43 % Lines
```

Per-file: `capabilities-section`, `cta-button`, `feature-journey`,
`feature-mockups`, `final-cta`, `how-it-works`, `landing-chrome`, `landing-hero`,
`landing-theme`, `pricing-faq`, `problem-section` all at **100%**;
`landing-page` 89.4%; `social-proof` 95.5%.

### Known gaps (intentional)

| File | Coverage | Why |
|---|---|---|
| `smart-menu-scene.tsx`, `hero-canvas.tsx`, `menu-screen-texture.ts` | 0% | WebGL / three.js. Cannot mount in jsdom; verified visually in Chrome at 1440px and 390px instead. |
| `checkout-form.tsx` | 0% | Pre-existing file, untouched by this redesign. Covered separately by `tests/checkout-form-payment-terms.test.tsx`. |
| `social-proof.tsx` lines 74–83 | uncovered | The testimonial `<video>` play/pause handler. jsdom does not implement `HTMLMediaElement.play()`. |
| `landing-page.tsx` branch coverage 50% | partial | The `prefers-reduced-motion` branch swapping the canvas for a static fallback. |

### Not covered by automated tests

- Visual layout and the desktop/mobile hero split — verified manually in Chrome
  at 1440×900 and 390×844.
- The unlayered `.landing-hero-copy` rule in `globals.css`, added because this
  project's Tailwind build emits `text-left` after `text-center`, so a
  `lg:text-left` variant loses the cascade. Verified in-browser.
- No E2E test was added. The critical purchase flow (`/checkout`) already has
  integration coverage; landing → checkout navigation is asserted at the
  `href` level only.

## Merge evidence

If these commits are squashed, preserve this summary:

- **RED:** `landing-clarity.test.tsx` failed 6/16 on `ReferenceError: IntersectionObserver is not defined` (framer-motion `whileInView` under jsdom) plus two nested-hook defects in the test file.
- **GREEN:** after adding the `IntersectionObserver` polyfill to `jest.setup.js` and fixing the test defects — 16/16 pass. The polyfill additionally repaired 5 unrelated pre-existing failures (suite went 8 failures → 3).
- **Follow-up tests:** `landing-sections.test.tsx` (19) and `landing-page-order.test.tsx` (2) passed on first run and are characterization coverage, not RED→GREEN.
- **Refactor:** none required; no production code was modified during the TDD cycle.
