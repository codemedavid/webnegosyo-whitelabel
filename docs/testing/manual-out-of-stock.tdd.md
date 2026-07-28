# Manual out-of-stock on the menu — TDD evidence

**Source plan:** none. Journeys were derived during this TDD run from the request
"add a manual out of stock on the menu management and show on the menu its
unavailable the item".

**Checkpoints:** RED → GREEN → app parity, cherry-picked onto `main`.
Developed on `feat/platform-supabase-order-parity`; the auto-86 wording changes
that branch also needed are not applicable here (see §4).

## The state model, and the decision behind it

`menu_items.is_available` already existed, and `false` already meant "off the
menu". But it was enforced as a **query filter** — `menu-server.tsx` fetched
only `is_available = true` — so an out-of-stock dish and a deleted dish looked
identical to a customer, and the "Unavailable" overlay that all 13 card
templates already render was unreachable code.

The user was offered three ways to express "out of stock" and chose to
**repurpose the existing toggle** rather than add a third state.

> **Accepted tradeoff, stated before implementing:** dishes merchants had
> previously hidden — discontinued items, seasonal items, drafts — now become
> visible on their public menus, marked unavailable. This was flagged and
> confirmed. If a merchant reports a resurrected dish, this is why.

## User journeys

1. As a merchant, I want to mark a dish out of stock in menu management, so
   customers see it is temporarily unavailable instead of it vanishing.
2. As a customer, I want an out-of-stock dish to still appear on the menu,
   clearly marked and not orderable, so I know it exists.
3. As a customer, I must not be able to order an out-of-stock dish — not by
   tapping its card, and not by opening its product URL directly.

## Task report

### 1. One home for the orderability decision

Turning a query filter into a decision means something has to own that decision.
`src/lib/menu-item-availability.ts` — `isMenuItemOrderable` — is it.

It deliberately defaults to **orderable** when `is_available` is absent. Several
call sites project a narrower column list than the full row, and this repo has
twice shipped features that were invisible because a column was missing from a
`SELECT` (modifier groups, mobile branding overrides). Reading a dropped
projection as "out of stock" would turn that class of mistake into an entire
menu no one can order from. The over-permissive add is the cheaper error:
`useCart.refreshCartItems` re-checks against the database and drops anything
that has since gone out of stock.

- Validation: `npx jest --testPathPatterns="menu-item-availability"`
- RED: `Test suite failed to run` — module did not exist (compile-time RED).
- GREEN: 4 passed.

### 2. The storefront grid stops filtering — and three neighbours must not

Removed `.eq('is_available', true)` from the menu grid query only.

The same flag is read by places that **offer** a dish rather than **list** it:
bundle slots, related items, upsell pickers. Offering a customer something they
cannot buy is a worse bug than omitting it, so those stay filtered. The test
asserts both halves; the "must not change" half is the one that would catch an
over-eager follow-up edit.

- Validation: `npx jest --testPathPatterns="menu-unavailable-on-menu"`
- RED: `fetches every dish, including the ones that are out of stock` failed.
- GREEN: 5 passed.

### 3. Three refusal points, not one

A disabled "+" button is not a guard. Two other paths reach an order:

- **The card body.** Every template makes its whole card clickable, routing to
  the product page. Thirteen designs each own that click, so the guard sits on
  `MenuItemCard` — the single wrapper they all render through — rather than
  being copied 13 times. The test asserts every registered template, so a future
  card design cannot quietly reopen the hole.
- **The product URL.** Shareable, indexed, reachable from a stale cart link. Both
  Add to Cart and Buy Now now refuse, with a visible reason rather than two
  mysteriously dead buttons.

- Validation: `npx jest --testPathPatterns="menu-item-card-unavailable"`
- RED: 14 failed (the tap guard, on every template).
- GREEN: 28 passed.

> **A test-quality note worth keeping.** The first version of the card test
> passed almost entirely by accident. Templates are `next/dynamic` chunks behind
> a skeleton fallback, so the clicks were landing on a skeleton with no click
> handler at all — "no handler fired" is indistinguishable from "the guard
> worked". Every out-of-stock assertion would have passed against zero
> implementation. The helper now waits for the real card before clicking, and
> each assertion has an in-stock mirror so a blanket "never open anything"
> cannot pass either.

### 4. Merchant wording

The switch read "Hidden", which is no longer what it does. It now reads
"Out of stock"; the edit form's checkbox reads "In stock" with a tooltip
spelling out that the dish stays on the menu.

- Validation: `npx jest --testPathPatterns="menu-items-list-out-of-stock"`
- RED: 2 failed.
- GREEN: 3 passed.

> **A collision waiting on `main`.** This work was developed on a branch that
> also carries the unshipped inventory auto-86 feature, where
> `is_available = false` can be set by the *system* rather than the merchant.
> There, the admin grid already showed an "Out of stock" badge, and renaming the
> merchant's switch to the same words erased exactly the distinction
> `auto_disabled_at` exists to record — so on that branch the badge takes an
> "(auto)" suffix, with the merchant app's mirrored copy updated in step.
>
> None of that exists on `main` yet, so none of it is included here. **Whoever
> lands auto-86 must re-apply the suffix**, or merchants will see two identical
> "Out of stock" labels meaning "I switched this off" and "the system pulled my
> bestseller without asking".

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | An in-stock dish is orderable; one marked out of stock is not | `tests/unit/menu-item-availability.test.ts` | unit | PASS |
| 2 | A dish whose `is_available` column was never selected stays orderable, so a dropped projection cannot blank a menu | `tests/unit/menu-item-availability.test.ts` | unit | PASS |
| 3 | Tapping an out-of-stock card does not open it — on all 13 registered templates | `tests/unit/menu-item-card-unavailable.test.tsx` | component | PASS |
| 4 | Tapping an in-stock card still opens it — on all 13 templates (guards against a blanket block) | `tests/unit/menu-item-card-unavailable.test.tsx` | component | PASS |
| 5 | An out-of-stock dish still renders its "Unavailable" marking | `tests/unit/menu-item-card-unavailable.test.tsx` | component | PASS |
| 6 | The storefront grid query fetches out-of-stock dishes instead of filtering them | `tests/unit/menu-unavailable-on-menu.test.ts` | guardrail | PASS |
| 7 | Bundle slots and related items still exclude out-of-stock dishes | `tests/unit/menu-unavailable-on-menu.test.ts` | guardrail | PASS |
| 8 | The product page refuses to add an out-of-stock dish, and disables both order buttons | `tests/unit/menu-unavailable-on-menu.test.ts` | guardrail | PASS |
| 9 | The merchant switch says "Out of stock" and no longer says "Hidden" | `tests/unit/menu-items-list-out-of-stock.test.tsx` | component | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom=... --testPathPatterns=...

File                        | % Stmts | % Branch | % Funcs | % Lines
----------------------------|---------|----------|---------|--------
 menu-item-card.tsx         |     100 |      100 |     100 |     100
 lib/menu-item-availability |     100 |      100 |     100 |     100
```

Full suite on this branch: `npx jest` → **248 suites / 2931 tests passed**.
Three `webnegosyo-app` suites fail (`order-item-images`,
`printer-native-load`, `product-image-upload`) — these fail identically on
pristine `main` with no changes applied, so the failing set is unchanged by
this work. Lint is clean on every touched file, and `tsc` reports nothing on
them (the repo carries pre-existing `tsc` errors in unrelated files).

## Known gaps

- **No E2E.** The three refusal points are covered by component and guardrail
  tests, not a browser run against a live tenant. Nothing here has been seen
  working end to end on a real storefront.
- **Server-side order acceptance is unchanged.** A crafted request that skips
  the UI entirely can still submit an out-of-stock dish. `refreshCartItems`
  removes such items from a real customer's cart, so this is not reachable
  through the product, but it is not a server-enforced invariant. Worth closing
  if out-of-stock is ever used for scarce/limited items rather than "we ran out
  today".
- **The mobile customer app change is untested.** `mobile/` has no test harness
  at all — no jest config, no test files — so this one part of the feature could
  not follow the RED/GREEN cycle. It was changed anyway rather than shipping a
  web storefront and a white-labeled app that disagree about what "out of stock"
  does. The change is small and symmetrical with the web (drop the query filter
  in `use-menu-items.ts`; disable the card's `TouchableOpacity`), the card's
  "Unavailable" overlay already existed, and `tsc` is clean on both files — but
  it is verified by inspection, not by a test.
- **Merchant app builds need a rebuild** to pick this up, per the usual
  white-label build pipeline.
