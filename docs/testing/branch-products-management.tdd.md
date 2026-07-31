# TDD evidence — Branch products in the Business view

**Source plan**: the `/ecc:plan` output in this session ("Branch Products in the Business view"); no `*.plan.md` file was written.
**Surface**: merchant app (`webnegosyo-app`), Business view. The web admin already had the equivalent (`branch-menu-panel.tsx`, `item-branches-panel.tsx`); this brings it to the phone.

## User journeys

1. As a store owner, I want to see which branches carry each product, so that I can spot a dish that quietly dropped off one branch's menu.
2. As a store owner, I want to switch a product off at one branch, so that a branch that cannot make it stops being ordered it.
3. As a store owner, I want to switch it back on later, so that the branch resumes selling it **at its own price**, not at the store-wide one.
4. As a store owner, I want the screen to tell me when a dish is off store-wide, so that I do not flip branch switches that cannot take effect.
5. As a merchant, I do not want a cashier reaching this screen, so that no one can delist dishes across the chain.
6. *(cycle 2)* As a store owner, I want to edit a product and add a new one from this screen, so that I do not have to leave the branch view to fix what I just noticed there.
7. *(cycle 2)* As a store owner, I want to narrow the list by category, so that a long menu is workable — the same way the Products tab works.

## Task report

| Task | Summary | Command | RED | GREEN |
|---|---|---|---|---|
| Pure listing-write decision + cross-branch view model (`lib/branch-menu.ts`) | Decides delete vs upsert vs no-op for one branch switch, and builds the owner's rows from the shared resolution | `npx jest lib/branch-menu.test.ts` | `TS2307: Cannot find module './branch-menu'` — compile-time RED, the new test newly references the missing decision | 12/12 pass |
| Supabase reads/writes (`lib/branch-menu-service.ts`) | Tenant-wide override read + read-then-merge write | `npx jest lib/branch-menu-service.test.ts` | `TS2307: Cannot find module './branch-menu-service'` | 8/8 pass |
| Screen + registration (`app/(main)/branch-menu.tsx`, workspaces, permissions, tab layout) | The Business-view tab and its three-place registration | `npx jest lib/branch-menu-screen-mount.test.ts lib/workspaces.test.ts` | 16 failed, 1 passed — `ENOENT ... app/(main)/branch-menu.tsx`, plus the Business tab-list assertion | 35/35 pass |
| **Cycle 2** — product management on the same screen (`filterBranchProducts`, add/edit via the shared editor, focus reload) | Add and Edit route to the Products tab's editor; category filter added; list reloads on focus | `npx jest lib/branch-menu.test.ts lib/branch-menu-screen-mount.test.ts` | 6 failed, 17 passed — `TS2305: Module './branch-menu' has no exported member 'filterBranchProducts'` plus the six management guardrails | 41/41 pass |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A branch's own price survives the dish being switched off and back on | `lib/branch-menu.test.ts:keeps a branch's own price when the dish comes back on` | unit | PASS |
| 2 | A row that only said "not here" is deleted, not left as store-wide defaults | `lib/branch-menu.test.ts:removes the row when the only thing it said was 'not here'` | unit | PASS |
| 3 | A zero branch price is a real price, never read as unset | `lib/branch-menu.test.ts:treats a zero branch price as a real price, not as unset` | unit | PASS |
| 4 | A branch's sold-out mark survives a listing change | `lib/branch-menu.test.ts:keeps a branch's sold-out mark when the dish is taken off the board` | unit | PASS |
| 5 | Switching on a branch that already carries the dish writes nothing | `lib/branch-menu.test.ts:writes nothing when the branch already says what was asked` | unit | PASS |
| 6 | Each branch is priced the way the customer is charged there | `lib/branch-menu.test.ts:prices each branch the way the customer is charged there` | unit | PASS |
| 7 | A dish off store-wide shows unavailable at every branch and is flagged | `lib/branch-menu.test.ts:shows a dish the whole store has 86'd as unavailable at every branch` | unit | PASS |
| 8 | A branch that does not carry a dish stays visible so it can be switched back | `lib/branch-menu.test.ts:marks each branch on or off for every product` | unit | PASS |
| 9 | A failed override read throws instead of claiming "no branch differs" | `lib/branch-menu-service.test.ts:throws rather than reporting a store with no branch differences` | integration (mocked Supabase) | PASS |
| 10 | The write sends the whole row, so a partial upsert cannot reset the branch price | `lib/branch-menu-service.test.ts:writes the whole row so a branch price survives being switched off` | integration | PASS |
| 11 | An unreadable current row aborts rather than overwriting it with defaults | `lib/branch-menu-service.test.ts:throws when the branch's current row cannot be read` | integration | PASS |
| 12 | A failed write is reported, in both the upsert and delete directions | `lib/branch-menu-service.test.ts:reports a failed write when ...` | integration | PASS |
| 13 | The tab is registered in workspaces, the tab layout, and the permission map | `lib/branch-menu-screen-mount.test.ts:branch products tab registration` | guardrail | PASS |
| 14 | A cashier cannot reach the cross-branch menu | `lib/branch-menu-screen-mount.test.ts:keeps a cashier from delisting dishes across the chain` | guardrail | PASS |
| 15 | A single-location store never sees the tab | `lib/branch-menu-screen-mount.test.ts:is hidden from a store that does not run several branches` | guardrail | PASS |
| 16 | The screen defers to the shared reads, resolution and write; no inline `outlet_menu_items` query | `lib/branch-menu-screen-mount.test.ts:branch products screen` | guardrail | PASS |
| 17 | Demo sessions cannot change a real store's branch menus | `lib/branch-menu-screen-mount.test.ts:blocks the demo session from changing a real store's menu` | guardrail | PASS |
| 18 | A failed toggle rolls back and says so | `lib/branch-menu-screen-mount.test.ts:restores the switch when the write fails` | guardrail | PASS |
| 19 | Search and category narrow together; a pair matching nothing returns nothing | `lib/branch-menu.test.ts:applies search and category together`, `:returns nothing rather than everything when the pair matches nothing` | unit | PASS |
| 20 | Filtering never mutates the catalogue | `lib/branch-menu.test.ts:never mutates the catalogue it was handed` | unit | PASS |
| 21 | Add opens the shared editor in create mode | `lib/branch-menu-screen-mount.test.ts:adds a product through the shared editor in create mode` | guardrail | PASS |
| 22 | Edit uses that same editor — no second product form writing the same table | `lib/branch-menu-screen-mount.test.ts:edits a product through that same editor rather than a second form` | guardrail | PASS |
| 23 | Editing and expanding the branches are separate tap targets | `lib/branch-menu-screen-mount.test.ts:keeps editing and the branch switches on separate targets` | guardrail | PASS |
| 24 | A demo session cannot create a product | `lib/branch-menu-screen-mount.test.ts:blocks the demo session from creating a product` | guardrail | PASS |
| 25 | Returning from the editor reloads the list, so a new product is visible and not added twice | `lib/branch-menu-screen-mount.test.ts:reloads when the screen comes back into focus` | guardrail | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/branch-menu*.ts' lib/branch-menu.test.ts lib/branch-menu-service.test.ts lib/branch-menu-screen-mount.test.ts

File                    | % Stmts | % Branch | % Funcs | % Lines
branch-menu-service.ts  |     100 |       90 |     100 |     100
branch-menu.ts          |     100 |    94.11 |    90.9 |     100
```

(49 tests across the three suites after cycle 2.)

Also run: `npx eslint` on the changed/added source files (clean), and `npx tsc --noEmit -p .`. The typecheck reports 3 errors, all in `app/(main)/subscription-paused.tsx` (`colors.surface` / `colors.text` do not exist) — a concurrent session's in-flight file, none in the files changed here.

## Known gaps

- **The screen itself is not rendered in a test.** Jest in this app only runs pure-logic roots (`lib/`, `theme/`); the screen is covered by source guardrails, the same convention as `payments-screen-mount.test.ts` and `daily-report-screen-mount.test.ts`.
- **No E2E.** The app has no E2E harness; verification is manual — owner account with ≥2 branches → Business → Products → toggle a dish off at one branch → that branch's storefront and register drop it, the other branch is unchanged.
- **Pre-existing unrelated failure**: `npm test` reports 1 failure in `lib/daily-report/parity.test.ts` ("covers every reason the web ledger can write"). Commit `bb6c17d` reformatted `StockMovementReason` in `src/lib/inventory/stock-ledger.ts` to a multi-line union, and that test's single-line regex now captures only `receive`. Untouched here — it belongs to concurrent inventory work. Full suite otherwise: **95 suites passed, 1594 tests passed** (after cycle 2).
- **Categories are filtered, not managed.** Creating or renaming a category still happens where it did before; only products are added and edited from this screen.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity` (interleaved with another session's commits on the same branch):

- `147c326` test: add reproducer for per-branch product listing writes (RED)
- `86eb7c5` feat: decide per-branch listing writes without losing branch prices (GREEN)
- RED for the service — `test: add reproducer for branch listing reads and whole-row writes`
- `feat: read and write branch listings from the merchant app` (GREEN)
- `2c823a1` test: add reproducer for the branch products screen and its gates (RED)
- `c4b1c86` feat: let an owner choose what each branch sells (GREEN)

Cycle 2 (product management on the same screen):

- `test: add reproducer for managing and adding products by branch` (RED)
- `feat: add and edit products from the branch products screen` (GREEN)

No refactor commit in either cycle: the implementation landed at its final shape and no restructuring followed GREEN.
