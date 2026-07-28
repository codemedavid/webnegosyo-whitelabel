# TDD evidence — Multi-branch Phase 7: two-screen chooser and dine-in

**Branch**: `feat/platform-supabase-order-parity`
**Source plan**: none on disk. Driven directly by two reference screenshots plus a request to make the branch flow usable for dine-in.

## What changed and why

The branch chooser collapsed two questions onto one screen: a pickup/delivery pill toggle sitting above a flat branch list. The redesign separates them, because **mode narrows branch** — asking for a branch first means listing branches the chosen mode cannot use and then explaining why half are greyed out.

Three decisions worth recording.

**Dine-in is a third mode, not a flavour of pickup.** A branch with table service and no takeaway counter supports one and not the other, and a delivery radius must never disqualify a customer already standing in the shop. Modelling it as `supports_pickup` with a flag would have made both of those unrepresentable. The DB constraint `outlets_fulfillment_ck` was widened rather than dropped: its intent — a branch must be reachable by at least one mode, or it can never be chosen for anything — is unchanged.

**`supports_dine_in` defaults to FALSE.** Every outlet that exists today was created by a merchant who was never shown a dine-in choice. Defaulting it on would put a "Dine In" tile on storefronts whose merchants may have no seating at all.

**The mode carries into checkout.** Checkout already asks the same question through the tenant's own order types, so answering twice was the real bug. `resolveOrderTypeIdForMode` matches on `OrderType.type`, never on the merchant's label — a merchant is free to name their dine-in type "Kain Dito", and a name-based match would stop working the moment they did, silently and only for them. No match returns null rather than guessing: picking "the first order type" would place a delivery order for a customer who chose to dine in.

## User journeys

1. As a customer, I want to say how I want my order before being asked where from, so the branch list only shows branches that can serve me that way.
2. As a customer eating in, I want a Dine In option on the website, so the same storefront works at the table.
3. As a customer, I want to see each branch's photo, whether it is open, when it closes, and how to drive there, so I can choose without leaving the page.
4. As a customer who knows the area but not the branch names, I want to search by address.
5. As a merchant with no seating, I want no Dine In tile on my storefront, without having to turn anything off.
6. As a merchant with table service and no takeaway counter, I want to configure a branch that offers only dine-in.
7. As a merchant who has not uploaded a branch photo or filled in hours, I want the card to still render correctly rather than break or lie.

## Task report

### Task 1 — dine-in as a third mode

`OutletOrderMode` gains `'dine_in'`; `supportsMode` in both `nearest-outlet.ts` and `outlet-selection.ts` branch on it, and `resolveCoverage` flips from `mode === 'pickup'` to `mode !== 'delivery'` so no walk-in mode consults a delivery radius. New `outlet-modes.ts` derives the tiles from the branches themselves.

- **RED**: `npx jest --testPathPatterns="outlets-dine-in-mode|outlets-card"` → `Cannot find module '../../src/lib/outlets/outlet-modes'`, `Test Suites: 2 failed`, `Tests: 0 total`. Committed as `daf25f0`.
- **GREEN**: same command → `Tests: 27 passed, 27 total`. Committed as `7a086d3`.

### Task 2 — persistence, and the projection that has bitten this repo before

Migration `20260731120000_outlet_dine_in_and_image.sql` adds both columns and widens the constraint. `OUTLET_SELECT`, `OutletWriteInput`, `OutletDraft`, and the `Outlet` type all carry them.

Two tests exist purely to guard the seam this codebase has broken on repeatedly — a column that exists, a form that writes it, and a SELECT projection that never asks for it, so the value saves and reads back `undefined`. For `supports_dine_in` that would have presented as "dine-in silently does nothing", with nothing in the logs.

- **RED**: `npx jest --testPathPatterns="outlets-dine-in-persistence"` → `Tests: 11 failed, 2 passed, 13 total`. Committed as `cb3b262`.
- **GREEN**: `npx jest --testPathPatterns="outlets"` → `Tests: 368 passed, 368 total`. Committed as `29f2e84`.

Three pre-existing tests asserted the old contract (`/pickup or delivery/i`, a projection allow-list, and a form round-trip) and were updated to the new spec rather than worked around. A fourth was added: a branch that only seats customers is now creatable.

### Task 3 — mode to order type

- **RED**: `npx jest --testPathPatterns="outlets-mode-order-type"` → `Cannot find module '../../src/lib/outlets/mode-order-type'`, `Tests: 0 total`.
- **GREEN**: same command → `Tests: 7 passed, 7 total`.

The first implementation used `is_active`/`sort_order`; `tsc --noEmit` caught that the real `OrderType` carries `is_enabled`/`order_index`. Fixed in both module and test.

### Task 4 — the two screens

`OutletModeScreen` (tiles) and `OutletPickerScreen` (search, locate, photo cards) are new; `OutletSplash` became the coordinator. Every claim a card makes comes from `buildOutletCard`, which is where the degradation rules live — the components only lay them out.

Details that are deliberate rather than incidental:

- The clock is read **once per picker mount**, not per card. Deriving `new Date()` inside each card would let two branches on the same screen disagree across a midnight boundary. Reading it at first render is safe here because the gate only mounts after hydration, so there is no server markup to contradict.
- `buildOutletCard` asks `getStoreOpenStatus` with enforcement **forced on**, because the two questions differ: whether ordering is *blocked* is the tenant's `enforce_operating_hours` decision, while the card only reports whether the doors are open. A merchant who publishes hours without enforcing them still wants "Closes 9:40 PM".
- A tenant offering exactly one mode skips the tile screen — and then the back button is passed `null` rather than rendering a control that does nothing.
- `outletDirectionsUrl` always builds an absolute `https` URL from a fixed origin, so merchant free-text reaches only the query string, encoded. A `javascript:` address cannot become an href.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A dine-in list contains only branches that seat customers | `outlets-dine-in-mode.test.ts` | unit | PASS |
| 2 | A branch with no pickup and no delivery is still offered for dine-in | `outlets-dine-in-mode.test.ts` | unit | PASS |
| 3 | A delivery radius never excludes a dine-in branch | `outlets-dine-in-mode.test.ts` | unit | PASS |
| 4 | A stored dine-in choice survives; one at a branch that stopped seating does not | `outlets-dine-in-mode.test.ts` | unit | PASS |
| 5 | Tiles appear only for modes an active branch supports, in fixed order | `outlets-dine-in-mode.test.ts` | unit | PASS |
| 6 | The branch card reports open/closed in the branch's own timezone | `outlets-card.test.ts` | unit | PASS |
| 7 | A branch with no configured hours reads as open, not hidden | `outlets-card.test.ts` | unit | PASS |
| 8 | Directions prefer coordinates, fall back to address, and are absent when neither exists | `outlets-card.test.ts` | unit | PASS |
| 9 | A direction link is always https — merchant text cannot inject a scheme | `outlets-card.test.ts` | unit | PASS |
| 10 | Search matches name and address, and returns nothing rather than everything on a miss | `outlets-card.test.ts` | unit | PASS |
| 11 | `OUTLET_SELECT` asks for both new columns | `outlets-dine-in-persistence.test.ts` | unit | PASS |
| 12 | A branch offering no mode at all is still rejected, naming all three | `outlets-dine-in-persistence.test.ts` | unit | PASS |
| 13 | An absent dine-in field is read as false, never as permission | `outlets-dine-in-persistence.test.ts` | unit | PASS |
| 14 | Dine-in and photo round-trip through the admin form; blank photo saves as null | `outlets-dine-in-persistence.test.ts` | unit | PASS |
| 15 | A dine-in-only branch can be created through the repository | `outlets-repository-contract.test.ts` | unit | PASS |
| 16 | The chosen mode selects the tenant's order type by type, not by label | `outlets-mode-order-type.test.ts` | unit | PASS |
| 17 | A disabled or missing order type yields null rather than a wrong pre-selection | `outlets-mode-order-type.test.ts` | unit | PASS |

## Coverage

`npx jest --coverage --collectCoverageFrom="src/lib/outlets/**/*.ts" --testPathPatterns="outlets"`

```
All files                       |   92.02 |    99.45 |   98.64 |   92.02
 mode-order-type.ts             |     100 |      100 |     100 |     100
 outlet-card.ts                 |     100 |      100 |     100 |     100
 outlet-modes.ts                |     100 |      100 |     100 |     100
 outlet-form.ts                 |     100 |      100 |     100 |     100
 outlet-selection.ts            |     100 |      100 |     100 |     100
 nearest-outlet.ts              |     100 |      100 |     100 |     100
 supabase-outlet-repository.ts  |       0 |        0 |       0 |       0
```

Every module touched by this phase is at 100%. The 92% aggregate is `supabase-outlet-repository.ts`, which is unchanged by this work and covered by the shared `outlets-repository-contract` suite against the in-memory implementation rather than by direct unit tests.

Full suite: `npx jest` → `Test Suites: 265 passed, 1 skipped`, `Tests: 3246 passed, 8 skipped`. `npx tsc --noEmit` reports no errors under `src/`. `npx eslint` clean on every touched file.

### Task 5 — component tests for the two screens

Added after the screens were written, so these are **characterization tests, not RED-first**: 19 of 20 passed on first run. The one genuine failure was an assertion that did not match the component's own copy, fixed in the test. They are recorded honestly as coverage of existing behaviour rather than as driven design.

- **Result**: `npx jest --testPathPatterns="outlet-chooser-screens"` → `Tests: 20 passed, 20 total`.

What they lock down: pressing a tile reports the mode; pressing a card reports the branch; a branch with no photo still renders and stays choosable; search narrows on address; `Get Direction` carries `rel="noopener"`; a delivery branch out of range is disabled and says why, while the same branch in dine-in mode is not.

### Task 6 — branch photo upload

The URL field was replaced with the existing `SimpleImageUpload` (ImageKit, `outlets` folder), matching how bundles and branding already take images. `npx tsc --noEmit` clean, `npx eslint` clean, `npx jest --testPathPatterns="outlet"` → `Tests: 395 passed, 395 total`.

### Task 7 — live database verification

- Migration applied via `apply_migration`; `information_schema` confirms `supports_dine_in boolean NOT NULL DEFAULT false` and `image_url text NULL`.
- The widened constraint was proven against the live schema by inserting a dine-in-only branch (`supports_pickup=false, supports_delivery=false, supports_dine_in=true`) inside a transaction and rolling it back. The insert succeeded — the old constraint would have rejected it. `SELECT count(*)` afterwards confirms 0 probe rows remain.
- Both tenants that have outlets (`cafejuancho`, `gungjeon-unlimited`) already carry an enabled `dine_in` order type at `order_index` 0, so `resolveOrderTypeIdForMode` will resolve for them.

## Known gaps

- **No browser E2E run.** Component tests cover each screen in isolation; nothing has driven the real flow mode → picker → menu → checkout in a browser. The Playwright pass has not been run, so the `OutletGate` wiring — the order-type fetch and the `setOrderType` call — is verified by reading and by types, not by execution.
- **No live tenant has dine-in switched on.** `gungjeon-unlimited` is the only tenant with `multi_branch_enabled = true`, and both its branches have `supports_dine_in = false`, so no Dine In tile shows on its storefront yet. That is a merchant toggle on a live storefront and was deliberately left for them to flip rather than changed from here.
- **No branch has a photo yet.** Every card will render the placeholder until a merchant uploads one. Correct behaviour, but it means the redesign's most visible element is unexercised in production.
- **`supabase-outlet-repository.ts` is at 0% direct coverage.** Unchanged by this phase and exercised through the shared contract suite against the in-memory implementation; the real Supabase calls are not unit-tested.
