# TDD evidence — branch-targeted push (Convex schema v15)

**Source plan**: inline `/ecc:plan` run of 2026-07-30 (Phase 2a). No `*.plan.md`
artifact; journeys were derived during planning and are reproduced below.

**Branch**: `feat/platform-supabase-order-parity`
**Commits**: `c193298` (RED) → `11953f9` (GREEN) → `327cea1` (deploy pipeline)

## Why this had to be a backend change

Every other branch narrowing in this product happens on the device, because the
device knows its own branch. Notifications are the exception: **a phone cannot
un-ring a notification it has already received.** So the fan-out has to be
decided before the push is sent.

This also corrects a claim made earlier in the same work stream. Adding
`outletId` to the Convex *order queries* would be defence-in-depth, not
confinement — `convex-template/convex/auth.config.ts` configures a JWT provider
but **no function calls `ctx.auth.getUserIdentity()`**, so any caller can omit
the argument. Push is different: the client never chooses the recipients.

## User journeys

1. As a **branch manager**, I want my phone to ring only for my branch's orders,
   so another branch's sales don't wake me.
2. As an **owner**, I want every branch's orders to reach me, so I keep
   whole-store visibility.
3. As a **single-location merchant**, I want nothing to change.

## Task report

### Task 1 — the recipient rule

New pure module `convex-template/convex/pushRecipients.ts`, deliberately free of
Convex imports so the platform repo's Jest run can reach it.

- **RED** — `npx jest --config jest.config.cjs convex-template/convex/pushRecipients`

  ```
  Cannot find module './pushRecipients' from 'convex-template/convex/pushRecipients.test.ts'
  Test Suites: 1 failed, 1 total
  ```

  Compile-time RED: the module under test did not exist.

- **GREEN** — same command: `Test Suites: 1 passed`, `Tests: 9 passed, 9 total`.

### Task 2 — which branch a device registers under

- **RED** — `npx jest lib/push-registration` (in `webnegosyo-app`)

  ```
  lib/push-registration.test.ts:4:3 - error TS2724: '"./push-registration"'
  has no exported member named 'pushRegistrationOutletId'.
  ```

- **GREEN** — same command: `Tests: 13 passed, 13 total`.

### Task 3 — wiring (guardrails)

`lib/push-branch-mount.test.ts`. The pure rules mean nothing if nothing calls
them, and an unwired version of this feature is **indistinguishable from the old
behaviour** — it rings every branch, which is exactly what it did before. So the
call sites are asserted on source text, the established pattern for this app
(Jest roots here are `lib/` and `theme/` only).

### Task 4 — deploy pipeline

Bumped `CURRENT_SCHEMA_VERSION` 14 → 15 and re-ran `npm run convex:prebundle`.

**A bug was caught here, not by a test.** The first prebundle run reported
`Compiled: pushRecipients.test.ts -> pushRecipients.test.js` and `Modules: 16` —
the prebundler globs `*.ts` in the convex directory, so it swept the new test
file into the bundle that is pushed to *every tenant*. `describe`/`it` do not
exist in the Convex runtime. `scripts/prebundle-convex.mjs` now excludes
`.test.ts`/`.spec.ts`; re-run reports `Modules: 15` and the only remaining
`pushRecipients.test` string in the bundle is prose inside a doc comment.

### Task 5 — a regression guard for the shipped artifact

Added in a later session, after the verification pass below. Task 4's bug was
caught by *reading prebundler output*, which means nothing would catch it next
time. `tests/unit/convex-push-bundle.test.ts` asserts on the committed bundle
instead: it carries every template module (catching a **stale** bundle, the
recurring hazard where a template edit reaches zero tenants), ships no
`.test.ts`/`.spec.ts` (catching a **poisoned** bundle), and contains the compiled
string `recipientsForOutlet` — esbuild inlines `pushRecipients.ts` into its
importers, so only the output proves it shipped.

**No RED was observable**: the prebundler fix had already landed. Rather than
fabricate one, two assertions prove the guard can fail — one feeds the predicate
a test module directly, the other runs the *pre-fix* filter
(`endsWith(".ts") && !startsWith("_")`) against the real directory and asserts it
leaks. A bundler that stopped reporting its inputs therefore cannot make the
guard vacuously green.

```
$ npx jest --config jest.config.cjs --testPathPatterns=convex-push-bundle
Tests: 5 passed, 5 total
```

Also confirmed while verifying: the working-tree bundle was byte-identical to the
committed one once `_meta.generatedAt` is disregarded — the re-run churned only
the timestamp, so the artifact tenants receive already carries this feature.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Only devices bound to the order's branch are rung | `pushRecipients.test.ts:rings only the devices bound to the order's branch` | unit | PASS |
| 2 | A device with no branch hears every branch (owner) | `…:rings a store-wide device for every branch` | unit | PASS |
| 3 | A token from an older app build is not silenced | `…:treats a device registered before branches existed as store-wide` | unit | PASS |
| 4 | An unbranched order still rings everyone (single-location parity) | `…:rings every device when the order carries no branch` | unit | PASS |
| 5 | Whitespace branch ids are treated as absent on both sides | `…:ignores blank branch ids on both sides` | unit | PASS |
| 6 | No devices registered is not an error | `…:returns nothing when no device is registered` | unit | PASS |
| 7 | The branch is read from the `customerData` stamp both writers use | `…:reads the branch the storefront and register stamp` | unit | PASS |
| 8 | A non-string or blank stamp yields no branch | `…:is null for a non-string or blank branch` | unit | PASS |
| 9 | A manager's device registers under their branch | `push-registration.test.ts:binds a branch manager's device to their branch` | unit | PASS |
| 10 | An owner's device stays store-wide | `…:leaves an owner's device store-wide, so it hears every branch` | unit | PASS |
| 11 | Registration passes the branch to Convex | `push-branch-mount.test.ts:registers the device under its branch` | guardrail | PASS |
| 12 | Registration never uses the drill-down scope | `…:takes the branch from the account, not a viewed selection` | guardrail | PASS |
| 13 | The send path filters before pushing | `…:narrows recipients to the order's branch before pushing` | guardrail | PASS |
| 14 | The unfiltered token list is not pushed to | `…:does not push to the unfiltered token list` | guardrail | PASS |
| 15 | `createOrder` passes the order's branch | `…:passes the new order's branch to the notification` | guardrail | PASS |
| 16 | The token carries a branch for the filter to match | `…:stores the branch on the token…` | guardrail | PASS |
| 17 | The pushed bundle is not stale — it carries every template module | `convex-push-bundle.test.ts:is not stale — it carries every template module` | artifact | PASS |
| 18 | No unit test is ever pushed into the Convex runtime | `…:never ships a unit test into the tenant runtime` | artifact | PASS |
| 19 | The compiled bundle actually contains the recipient rule | `…:carries the branch-targeting rule, not just a reference to it` | artifact | PASS |
| 20 | That exclusion guard can fail (not vacuously green) | `…:has teeth…`, `…:would have caught the filter this bundler shipped before` | artifact | PASS |

## Design decisions worth keeping

**Every rule fails toward noise, never silence.** One extra buzz is an
annoyance; a notification reaching nobody loses the order. Concretely: absent
`outletId` on a *token* means store-wide (this is what makes an owner's phone
work, and what stops the change from silencing every already-registered device),
and absent `outletId` on an *order* rings everyone (single-location stores stamp
no branch, so filtering would deliver to nobody).

**Registration uses the account scope, never the owner's drill-down.** A token
outlives the screen that wrote it, so registering under a viewed branch would
leave an owner permanently deaf to every other branch after backing out of one —
a silent failure they could not diagnose. Guardrail 12 locks this.

## Validation

```bash
npx jest --config jest.config.cjs        # root: 295 passed, 3564 tests
cd webnegosyo-app && npx jest            # 79 suites, 1251 tests
cd webnegosyo-app && npx tsc --noEmit    # exit 0
cd convex-template && npx tsc --noEmit   # exit 0
npm run lint                             # 88 errors, all pre-existing
```

`npm run lint` reports 88 errors repo-wide; grepping for every file touched here
returns nothing, and they sit in `webnegosyo-desktop/` and vendored sources.

## Known gaps — nothing here has run on a device

- **Not verified end-to-end.** A push cannot be simulated from Node. The
  acceptance test is live: place an order at Central Cignal on
  `gungjeon-unlimited` and confirm only the manager's phone rings.
- **The owner half is untestable today.** `gungjeon-unlimited` has only the
  manager account — no owner — so journey 2 has no fixture.
- **Requires an app rebuild.** `pushRegistrationOutletId` ships in the app
  binary. Until merchants update, every existing token stays store-wide, which
  degrades to exactly today's behaviour rather than to silence.
- **Deploy order.** gungjeon is v14 (clean +1); cafejuancho, the only other
  multi-branch tenant, is at **v5** and takes the whole delta in one push.
  Deploy gungjeon first, verify, then cafejuancho alone, then the ~51 remaining.
- **Convex order queries are still unscoped** (Phase 2b, not done). Branch
  narrowing of order *lists* remains client-side, and on Convex it cannot be a
  security boundary until functions authenticate.

## Concurrent-session note

Another Claude session is committing to this branch. During this run an
untracked `tests/unit/branch-manager-branch-surfaces.test.ts` appeared with 14
failing tests — their in-flight RED gate, not a regression here. It was left
untouched and uncommitted. Only explicit paths were staged.

---

# Phase 2b — branch-scoped Convex order reads

Added after the above, same branch. Commits `726131d` (RED) → `f5c7993` (GREEN).

## Journeys

1. As a **branch manager**, I want only my branch's orders to reach my device, so
   other branches' customer names and phone numbers are not shipped to it.
2. As an **owner**, I want to keep seeing every branch.
3. As a **single-location merchant**, I want nothing to change.

## The constraint that shaped the design

`hooks.ts` passes query args straight to `useQuery`, and a Convex deployment on
an older bundle **rejects an argument its validator does not know**. `hooks.ts`
classifies that rejection as a stale bundle and shows "needs a backend update"
instead of the orders. Live versions: **32 tenants at v13**, 10 at v5, 1 at v14.

So `outletId` is sent **only when the account is branch-scoped** — which by
definition only happens on a tenant that has branches, and therefore one we
deploy. Journey 3 is protected by construction: a store-wide account produces
byte-identical args, with the key *absent* (not `undefined`, which the validator
would still see).

## The trap that would have inverted the feature

Orders written before v15 carry the branch **only** in `customerData.outlet_id`.
Filtering on the new column alone would have *hidden* every existing branch
order — the same trap recorded for the platform backend, where a naive
`.eq('outlet_id')` would have hidden every counter sale from the branch that rang
it up. **Both live orders on `gungjeon-unlimited` are blob-only right now**, so
this fallback is load-bearing from day one, not defensive padding.

`resolveOrderOutletId` reads column-then-blob, and the queries over-fetch to
`BRANCH_SCAN_LIMIT` (500) before filtering in memory — correctness over the
index until a backfill lands.

## RED / GREEN

| Task | RED | GREEN |
|---|---|---|
| Which args a Convex order query sends | `TS2307: Cannot find module './convex-order-scope'` (compile-time) | `Tests: 8 passed` |
| Branch of a pre-v15 order | 3 failed / 9 passed — `resolveOrderOutletId is not a function` | `Tests: 12 passed` |
| Filtering a page to one branch | 3 failed / 12 passed — `filterOrdersToOutlet is not a function` | `Tests: 15 passed` |

## Added guarantees

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 21 | A confined account's query asks for its branch | `convex-order-scope.test.ts:asks the backend for one branch…` | PASS |
| 22 | A store-wide account sends byte-identical args (key absent) | `…:sends exactly today's arguments for a store-wide account` | PASS |
| 23 | The arg never goes to a query that cannot accept it | `…:never adds the argument to a query that cannot accept it` | PASS |
| 24 | The live queue is scoped too, not just the list | `…:scopes the live queue as well as the list` | PASS |
| 25 | A skipped query stays skipped | `…:passes a skipped query through untouched` | PASS |
| 26 | A caller's own `outletId` cannot narrow an owner's view | `…:does not let a caller's own outletId survive…` | PASS |
| 27 | The scoped-ref set is pinned against silent additions | `…:lists only refs whose backend validator accepts a branch` | PASS |
| 28 | A pre-v15 order's branch is still found (blob fallback) | `pushRecipients.test.ts:falls back to the blob…` | PASS |
| 29 | The column wins once an order has one | `…:prefers the column once an order has one` | PASS |
| 30 | Unbranched orders are excluded from a branch view | `filterOrdersToOutlet:excludes unbranched orders…` | PASS |
| 31 | No branch asked for returns every order untouched | `…:returns every order untouched when no branch is asked for` | PASS |

Note the deliberate asymmetry with push: `filterOrdersToOutlet` **excludes**
unbranched orders, while `recipientsForOutlet` **includes** them. A missed
notification loses an order; a row missing from a branch list is still reachable
from the store-wide view.

## Validation

```bash
npx jest --config jest.config.cjs --testPathPatterns=pushRecipients   # 15 passed
cd webnegosyo-app && npx jest                                        # 81 suites, 1274 tests
cd webnegosyo-app && npx tsc --noEmit                                # exit 0
cd convex-template && npx tsc --noEmit                               # exit 0
npm run convex:prebundle                                             # Modules: 15
npx jest --config jest.config.cjs --testPathPatterns=convex-push-bundle  # 5 passed
```

Folded into **v15** rather than bumping to 16, after verifying no tenant has been
deployed to v15 (32@v13, 10@v5, 1@v14, 1@v9). Bundle rebuilt.

Lint: `npm run lint` reports no error or warning for any file added or changed
here. Two nearby diagnostics were checked and are pre-existing — the `any` at
`convex-template/convex/orders.ts:201` is inside `reviseOrder` (only its line
number moved) and the unused-directive warning in `hooks.ts` is byte-identical at
`HEAD`.

## Known gaps

- **`by_outlet` is created but never used.** The filter cannot trust it while
  blob-only orders exist. A backfill promoting `customerData.outlet_id` into the
  column would let the queries use the index and drop the over-fetch — not done.
- **`BRANCH_SCAN_LIMIT` is a ceiling, not pagination.** A branch whose orders sit
  deeper than 500 rows in a status bucket would be truncated.
- Still not deployed, still needs an app rebuild, still no owner account on
  `gungjeon-unlimited` to exercise journey 2. Unchanged from Phase 2a.

## Concurrent-session note

Three inventory suites (`inventory-order-stock-besteffort`,
`inventory-alerts-integration`, `inventory-stock-alerts-wiring`) fail in the root
run. They are another session's **uncommitted** in-flight work in the shared tree
(`src/lib/inventory/order-stock-service.ts` and their own tests appear in
`git diff`), not a regression here. Left untouched; only explicit paths staged.
