# TDD Evidence Report — Branding Studio Click-to-Inspect

**Date:** 2026-07-10
**Branch:** feat/superadmin-convex-analytics

## Source plan

Inline plan produced by `/ecc:plan` in this session (no `*.plan.md` artifact):
hover any storefront region in the Branding Studio preview, see it
highlighted, click it, and the settings panel jumps to that region's exact
configuration (surface + accordion section). Section-level granularity for v1.

## User journeys

1. As a merchant in the Branding Studio, I want to click "Inspect" and hover
   the live preview so highlighted outlines show me which parts of my
   storefront are editable.
2. As a merchant, I want to click a highlighted element so the settings panel
   opens the exact section that configures it, instead of hunting through 8
   surfaces and ~40 sections.
3. As a merchant, I want normal preview interactions (links, buttons, cart)
   back as soon as I pick an element or turn Inspect off.

## Task report

| Task | Summary | Validation | RED evidence | GREEN evidence |
|---|---|---|---|---|
| Scope registry + protocol (`src/lib/branding-inspect.ts`) | Pure map `data-branding-scope` key → `{surfaceId, sectionTitle, label}` + `resolveBrandingScope` / `getScopeSectionIndex`, validated against `BRANDING_SURFACES` and `PRODUCT_DETAIL_SECTIONS` | `npx jest --testPathPatterns=branding-inspect` | `Cannot find module '@/lib/branding-inspect'` (commit `923f44e`) | 12 passed (commit `d3ef2d5`) |
| Iframe-side inspector (`src/components/customer/branding-inspector.tsx`) | Message-driven overlay: same-origin enable, capture-phase hover highlight + click swallow, posts scope to editor, Escape clears | `npx jest --testPathPatterns=branding-inspector` | `Cannot find module '@/components/customer/branding-inspector'` (commit `9eedbbb`) | 7 passed (commit `604f9aa`) |
| Region tagging + mounts | `data-branding-scope` on header (6 templates via shared `HEADER_SCOPE_PROPS`), hero (preset + block), announcement, category nav, search, menu grids, quick-view, cart drawer, footer, flash, checkout, product detail (7 regions), page root; inspector mounted on menu/checkout/product routes | `npx jest --testPathPatterns=branding` + `next lint` | n/a (declarative attributes; correctness of keys guarded by registry test) | 103 passed, ESLint clean (commit `e721764`) |
| Editor bridge (`preview-frame.tsx`) | Streams inspect-mode into iframe (on toggle, on draft send, on iframe ready/load); forwards same-origin scope selections; ignores foreign origins / non-string scopes | `npx jest --testPathPatterns=preview-frame-inspect` | 2 failed / 2 passed — mode not posted, selection not forwarded (commit `2e32ddd`) | 4 passed (commit `0823d95`) |
| Studio wiring (`branding-studio.tsx`) | Top-bar Inspect toggle; selection resolves scope → switches surface, opens/scrolls/pulses the section, exits inspect mode; unknown scope → toast | covered indirectly (pure jump logic `resolveBrandingScope`/`getScopeSectionIndex` at 100%) | — | full suite green (commit `0823d95`) |

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Every scope key maps to a real surface id and is namespaced `<surfaceId>/…` | `tests/unit/branding-inspect.test.ts` | unit | PASS |
| 2 | Every scope's section title exists in the live registry (renames break CI, not the UX) | `tests/unit/branding-inspect.test.ts` | unit | PASS |
| 3 | Unknown / non-string scope keys resolve to null (untrusted postMessage payloads) | `tests/unit/branding-inspect.test.ts` | unit | PASS |
| 4 | `getScopeSectionIndex` returns the accordion index (tenant + product registries), -1 when stale | `tests/unit/branding-inspect.test.ts` | unit | PASS |
| 5 | Inspector renders nothing until the editor enables it from the same origin | `tests/unit/branding-inspector.test.tsx` | unit | PASS |
| 6 | Hovering a tagged region shows a labelled highlight; untagged content shows nothing | `tests/unit/branding-inspector.test.tsx` | unit | PASS |
| 7 | Clicking a highlighted region reports the scope to the editor AND swallows the click | `tests/unit/branding-inspector.test.tsx` | unit | PASS |
| 8 | Disabling inspect mode restores normal clicks; Escape clears the highlight | `tests/unit/branding-inspector.test.tsx` | unit | PASS |
| 9 | Cross-origin enable messages are ignored | `tests/unit/branding-inspector.test.tsx` | unit | PASS |
| 10 | PreviewFrame posts inspect-mode to the iframe when toggled | `tests/unit/preview-frame-inspect.test.tsx` | unit | PASS |
| 11 | PreviewFrame forwards same-origin string scope selections only | `tests/unit/preview-frame-inspect.test.tsx` | unit | PASS |

Full suite: `npm test` → 1449 passed / 3 failed — the 3 failures are
pre-existing in `webnegosyo-app/` (printer-native + order-item-images,
uncommitted work from a separate session; untouched by these commits).

## Coverage

`npx jest --testPathPatterns="branding-inspect|branding-inspector|preview-frame-inspect" --coverage`:
`branding-inspect.ts` 100% stmts, `branding-inspector.tsx` 95.9%,
`preview-frame.tsx` 97.0% — all above the 80% threshold.

**Intentional gaps:**
- `branding-studio.tsx` wiring (toggle button, scroll/pulse timing) is not
  unit-tested — it would need heavy mocking of next/navigation, server
  actions and the Tenant model; the decision logic it delegates to is at 100%.
- Modal-only regions (quick-view, cart drawer) are hoverable only after being
  opened in the preview — documented behavior, not tested E2E.
- No E2E test yet; a Playwright journey (toggle → hover → click → section
  opens) is the natural follow-up.

## Merge evidence (if checkpoints are squashed)

RED→GREEN pairs: `923f44e`→`d3ef2d5` (registry), `9eedbbb`→`604f9aa`
(inspector), `2e32ddd`→`0823d95` (editor bridge); tagging sweep `e721764`
validated by 103 branding tests + ESLint. No refactor commit was needed —
implementations landed minimal and lint-clean.
