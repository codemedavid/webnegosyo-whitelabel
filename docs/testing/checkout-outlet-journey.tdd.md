# TDD Evidence — Checkout branch-selection journey hardening

**Branch**: `feat/platform-supabase-order-parity`
**Checkpoints**: `3e219c9` (RED) → `ac4ba6b` (GREEN)
**Scope**: the UI/UX of the outlet picker and the checkout journey it gates.

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from a read of the
shipped surfaces: `use-checkout-outlet.ts`, `checkout-outlet-screen.tsx`,
`outlet-picker-screen.tsx`, `checkout-outlet.ts`, and the `useCheckout` submit
guard. This follows the `after`-timing feature documented in
[multi-branch-selection-timing.tdd.md](./multi-branch-selection-timing.tdd.md).

## User journeys

1. As a customer, I want my order to always belong to a real branch, so that
   the merchant knows which kitchen is cooking it.
2. As a customer, I want to know when the branch I picked is taken away from
   me, so that I am not silently moved or dumped back on a screen with no
   explanation.
3. As a customer on a slow connection, I want the page to tell me it is still
   loading branches, rather than showing me an empty list or letting me submit.
4. As a customer using a screen reader, I want to hear whether a branch is open
   before I choose it.
5. As a customer, I want the buttons on screen to do something when I tap them.

## Defects found and fixed

| # | Defect | Severity | Where |
|---|--------|----------|-------|
| 1 | Order placed against **no branch** while the branch list is still loading — the picker is hidden, the CTA is live | HIGH | `use-checkout-outlet.ts` |
| 2 | Order placed against **no branch** when the chosen order type leaves zero eligible branches — same cause | HIGH | `use-checkout-outlet.ts` |
| 3 | `new Date()` read during render of a client component that Next.js also renders on the server — a branch near its closing time can be `Open` in the server HTML and `Closed` after hydration | MEDIUM | `checkout-outlet-screen.tsx` |
| 4 | "Use my location" button rendered enabled and wired to `() => {}` — a visible control that does nothing | MEDIUM | `checkout-outlet-screen.tsx` / `outlet-picker-screen.tsx` |
| 5 | Changing the order type drops the customer's branch and returns them to a full-screen picker with no explanation | MEDIUM | `use-checkout-outlet.ts` / screen |
| 6 | A branch button's accessible name is the branch name alone; open/closed and out-of-range sit outside the tap target | MEDIUM (a11y) | `outlet-picker-screen.tsx` |

### Root cause shared by #1 and #2

`isMissingRequiredSelection` was derived from `isPickerVisible`, which answers
*"is there a list worth showing"* — `shouldPickOutletAtCheckout(...) && choices.length > 1`.
Both an unloaded list and a zero-eligible list make that false, which hid the
picker **and** satisfied the submit guard in `useCheckout.ts:776`.

The obligation to name a branch now follows the **tenant**, not the list:

```ts
const isMissingRequiredSelection =
  isAfterTiming && (isLoading || (outlets.length > 0 && resolvedOutletId === null))
```

It lifts in exactly one case — a tenant that opted in but has no active branches
yet — which degrades to today's branchless checkout rather than stranding the
customer on a screen with nothing to choose.

## Task report

### RED

```
$ npx jest --testPathPatterns=checkout-outlet-journey
Tests:       11 failed, 2 passed, 13 total
```

All 11 failed because the asserted field or behaviour did not exist
(`isLoading` / `droppedReason` undefined, location button present, wall clock
read during render, accessible name missing the status). No failure came from
setup, syntax, or an unrelated regression.

The 2 that passed at RED are honest passes, kept as regression locks: the
picker's existing empty-state copy already reads correctly, and the select
callback already worked. Defect #2 is what made the empty state *unreachable*.

### GREEN

```
$ npx jest --testPathPatterns=checkout-outlet-journey
Tests:       14 passed, 14 total

$ npm run test
Test Suites: 1 skipped, 286 passed, 286 of 287 total
Tests:       8 skipped, 3497 passed, 3505 total

$ npx tsc --noEmit          # 0 errors under src/
$ npm run lint              # no findings in the changed files
$ npx playwright test
3 passed, 1 skipped (15.7s)
```

Two tests were corrected between RED and GREEN because **my assertion was
wrong, not the code**: with only one delivery-capable branch left, the resolver
correctly auto-selects it rather than returning null. The fixture was widened to
three branches to exercise the case I meant, and the auto-select behaviour was
captured as its own test.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | The order is held while branches are still loading | `checkout-outlet-journey.test.tsx:holds the order while the branches are still loading` | unit | PASS |
| 2 | The order is held when no branch can serve the chosen order type | `…:holds the order when no branch can serve the chosen order type` | unit | PASS |
| 3 | A tenant with no active branches still gets a plain checkout | `…:still degrades to a plain checkout for a tenant with no branches at all` | unit | PASS |
| 4 | A single-location tenant is never blocked and never fetches | `…:never blocks a single-location tenant, which does no fetch at all` | unit | PASS |
| 5 | A branch dropped by an order-type change is reported as such | `…:reports why a branch was dropped when the order type outgrew it` | unit | PASS |
| 6 | An auto-move to the last remaining branch still reports the change | `…:moves the order to the only branch left, and still says the choice changed` | unit | PASS |
| 7 | No reason is claimed when the customer simply has not chosen | `…:carries no reason when the customer simply has not chosen yet` | unit | PASS |
| 8 | The checkout screen offers no dead location button | `…:offers no location button, because nothing is wired to it` | unit | PASS |
| 9 | Loading says so instead of showing an empty list | `…:says so while the branches are loading…` | unit | PASS |
| 10 | A dead end is explained, not shown as a blank picker | `…:explains a dead end instead of showing a blank picker` | unit | PASS |
| 11 | An order-type change explains itself on screen | `…:explains why the branch was dropped when the order type changed` | unit | PASS |
| 12 | The clock is read once, so hydration cannot disagree | `…:reads the clock once, so hydration cannot disagree with the server` | unit | PASS |
| 13 | A branch and its status share one accessible name | `…:announces a branch and its status in one accessible name` | unit | PASS |
| 14 | The chosen branch still reaches checkout | `…:still hands the chosen branch back` | unit | PASS |
| 15 | The branch screen takes over checkout until answered (browser) | `e2e/multi-branch-selection-timing.spec.ts:takes over checkout…` | e2e | PASS |

## Coverage

```
$ npx jest --coverage --testPathPatterns="outlet|checkout" \
    --collectCoverageFrom="src/hooks/use-checkout-outlet.ts" \
    --collectCoverageFrom="src/components/customer/checkout-templates/checkout-outlet-*.tsx" \
    --collectCoverageFrom="src/components/customer/outlet-picker-screen.tsx" \
    --collectCoverageFrom="src/lib/outlets/checkout-outlet.ts" \
    --collectCoverageFrom="src/lib/outlets/selection-timing.ts"

All files | 99.85 % Stmts | 93.68 % Branch | 100 % Funcs | 99.85 % Lines
```

Above the 80% threshold on every axis.

## Known gaps

- **`src/lib/outlets/outlets-client.ts` remains at 0% unit coverage.** It is
  mocked in every hook test. Its error branch (returns `[]` on a failed read) is
  exercised indirectly by guarantee #3, which is the behaviour that matters.
- **A closed branch is still selectable.** `buildOutletCard` computes `isOpen`
  and the picker only *labels* it; nothing blocks choosing a shut branch. This
  is plausibly intentional (advance orders exist, and per-branch enforcement is
  a tenant policy question rather than a UI one), so it was left alone rather
  than changed on assumption. **Needs a product decision.**
- **The `orders` RLS blocker is unchanged.** `createOrder` inserts as anon with
  `.insert().select().single()` and no SELECT policy on `orders` covers anon, so
  the order-placement E2E remains `test.fixme`. See
  [multi-branch-selection-timing.tdd.md](./multi-branch-selection-timing.tdd.md).
  This means guarantees #1 and #2 are proven at the hook layer but the *end* of
  that path is not yet provable in a browser.

## Merge evidence

If squashed, preserve:

> RED `3e219c9`: 11 failed / 2 passed — six defects in the checkout branch
> journey, each failing for its intended reason.
> GREEN `ac4ba6b`: 14 passed; full suite 3497 passed; tsc clean under `src/`;
> Playwright 3 passed / 1 pre-existing fixme; touched-module coverage 99.85%
> stmts / 93.68% branch.
