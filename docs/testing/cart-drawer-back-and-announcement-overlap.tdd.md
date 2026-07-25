# TDD evidence — cart drawer back control + announcement overlap

**Source plan:** none. Journeys derived during this TDD run from a customer screenshot
(storefront on iOS Safari) showing the green announcement strip painted over the top of
the open cart drawer, with the drawer's item count clipped and no visible way back.

## User journeys

1. As a customer on a phone, I want a clear back control in the cart drawer, so that I can
   return to the menu without hunting for a faint corner X.
2. As a customer, I want the announcement strip to stay behind the cart drawer, so that the
   drawer's header and close control are never covered.

## Task report

### Task 1 — Announcement strip must stack below the overlay layer

The strip was rendered inline in `menu-client.tsx` with `relative z-[51]`. Every Radix
portal in the app (Sheet, Dialog, AlertDialog) paints at `z-50`, so the strip out-ranked
all of them site-wide. Extracted it into `src/components/customer/announcement-bar.tsx` at
`z-40` — still above page content, below the overlay layer — and exported `OVERLAY_Z_INDEX`
so the constraint is a named constant instead of a magic number.

- Validation command: `npx jest tests/unit/announcement-bar.test.tsx`
- RED: `Cannot find module '../../src/components/customer/announcement-bar'` — compile-time
  RED; the test newly exercises a component that did not exist.
- GREEN: `Tests: 5 passed`
- Guaranteed: the bar renders only when the tenant enabled it, honours the tenant's
  announcement colors, and its z-index is strictly less than the overlay layer.

### Task 2 — Explicit back control in the cart drawer header

The drawer relied on `SheetContent`'s default corner X. Added a labelled back arrow at the
head of the drawer title row (`aria-label="Back to menu"`, wired to `onClose`), plus a
`hideCloseButton` option on `SheetContent` so the default X is suppressed and the header
does not carry two overlapping close affordances.

- Validation command: `npx jest tests/unit/cart-drawer-close-affordance.test.tsx`
- RED:
  ```
  ● CartDrawer close affordance › renders a labelled back control in the drawer header
  ● CartDrawer close affordance › closes the drawer when the back control is pressed
  Tests: 2 failed, 1 passed, 3 total
  ```
- GREEN: `Tests: 3 passed`
- Guaranteed: the drawer exposes exactly one close control, it is reachable by accessible
  name, and pressing it invokes `onClose`.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Announcement renders when the tenant has it visible | `tests/unit/announcement-bar.test.tsx:renders the tenant announcement when it is visible` | unit | PASS | `npx jest tests/unit/announcement-bar.test.tsx` |
| 2 | Announcement renders nothing when hidden or when there is no tenant | `tests/unit/announcement-bar.test.tsx:renders nothing when …` | unit | PASS | same |
| 3 | Announcement applies the tenant's bg/text colors | `tests/unit/announcement-bar.test.tsx:applies the tenant announcement colors` | unit | PASS | same |
| 4 | Announcement stacks below the overlay layer, so drawers/modals paint over it | `tests/unit/announcement-bar.test.tsx:stacks below the overlay layer …` | unit | PASS | same |
| 5 | Cart drawer header exposes a labelled back control | `tests/unit/cart-drawer-close-affordance.test.tsx:renders a labelled back control …` | unit | PASS | `npx jest tests/unit/cart-drawer-close-affordance.test.tsx` |
| 6 | Pressing the back control closes the drawer | `tests/unit/cart-drawer-close-affordance.test.tsx:closes the drawer when the back control is pressed` | unit | PASS | same |
| 7 | Exactly one close control — the default X is not stacked on top | `tests/unit/cart-drawer-close-affordance.test.tsx:exposes exactly one close control …` | unit | PASS | same |

## Coverage and known gaps

```
File                  | % Stmts | % Branch | % Funcs | % Lines
 announcement-bar.tsx |     100 |    57.14 |     100 |     100
 cart-drawer.tsx      |    88.8 |    56.52 |      25 |    88.8
```

- `announcement-bar.tsx` is fully covered by statements/lines; the uncovered branches are
  the color/text fallback defaults when a tenant leaves those fields null.
- `cart-drawer.tsx` branch/function coverage reflects the whole drawer (upsell prefetch,
  bundle paths, remove dialogs), not this change; those paths are out of scope here.
- Full suite: `npx jest` → `Test Suites: 4 failed, 173 passed` / `Tests: 12 failed, 2112 passed`.
  All 4 failing suites are pre-existing and unrelated (`webnegosyo-app/lib/printer-native-load`,
  `webnegosyo-app/lib/order-item-images`, plus two untracked in-flight test files from other
  work). Verified by stashing this change and re-running those suites — they still fail.
- Not covered by unit tests: real stacking-context rendering. jsdom does not compute
  z-index, so test #4 asserts the Tailwind class value rather than painted order. A visual
  check on a phone-width viewport is the remaining verification.
- `npx next lint` on all four touched files: `✔ No ESLint warnings or errors`.

## Merge evidence

- RED checkpoint: `2da76f1 test: add reproducers for cart drawer back control and announcement layering`
- GREEN checkpoint: `fb65e42 fix: cart drawer back control and announcement bar overlapping the drawer`
- No separate refactor commit — the extraction of `AnnouncementBar` was part of the fix.
