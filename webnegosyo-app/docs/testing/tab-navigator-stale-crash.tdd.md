# TDD evidence — "Cannot read property 'stale' of undefined" tab navigator crash

## Source plan

No `*.plan.md`. The starting point was a runtime crash report from the merchant
app (`webnegosyo-app`), pasted twice in succession:

```
ERROR  [TypeError: Cannot read property 'stale' of undefined]

Code: _layout.tsx
  40 |   return <Text style={{ fontSize: 22, color }}>{symbol}</Text>;
Call Stack
  TabIcon (app/(main)/_layout.tsx:40:47)
  ErrorBoundary (app/_layout.tsx:45:4)
```

The `TabIcon` frame is a source-map artifact — the throw is not in that
component. The meaningful part of the trace is that the `(main)` tab tree fell
into its `ErrorBoundary`.

## Root cause

Established by reading the installed libraries and probing them directly, not by
inference. Each link was verified:

1. `router.replace(href)` dispatches a **REPLACE** action —
   `expo-router/build/global-state/routing.js:120`,
   `linkTo(..., { event: 'REPLACE' })`.
2. When that action lands inside the tab navigator, expo-router's
   `tabRouterOverride` handles REPLACE by rewriting the navigator's own state
   key to `` `${nextState.key}-replace` `` —
   `expo-router/build/layouts/TabRouter.js`. **Verified empirically**: driving
   the real override turned `tab-N-hypkfQpvXw9kyvbfWAP` into
   `tab-N-hypkfQpvXw9kyvbfWAP-replace`, while NAVIGATE and JUMP_TO left the key
   untouched.
3. A changed state key remounts the navigator, so `currentState` is `undefined`
   on the next render while the nested params are already marked consumed. That
   combination makes the initialization guard at
   `@react-navigation/core/lib/module/useNavigationBuilder.js:267` evaluate
   false (it requires `!isNestedParamsConsumed`), so control falls through to
   the `else` branch.
4. Line 278 then calls `router.getRehydratedState(stateBeforeInitialization,…)`
   where `stateBeforeInitialization` is `undefined`.
5. `TabRouter.getRehydratedState` reads `state.stale` on `undefined` and throws
   — `@react-navigation/routers/lib/module/TabRouter.js:122`.

This matches, and now explains, the crash comments already scattered through
`app/_layout.tsx`, `app/(superadmin)/_layout.tsx`, `app/(auth)/login.tsx`, and
`lib/superadmin-mount.test.ts`.

**Rule:** never `router.replace()` to a route inside the same tab navigator.
Leaving the tab tree (to `(auth)` / `(superadmin)`) is unaffected — that action
targets the root stack, where replace is both correct and safe.

Note the crash only fires when the target route is not already at index 0: the
override guards its key rewrite with `if (nextState.index !== 0)`.

## User journeys

1. As a cashier, I want to finish taking a payment and land on the Drawer, so
   that I can see the sale I just rang up — without the app crashing.
2. As a merchant, I want to scan a customer's QR code and be taken to Orders, so
   that I can act on the order — without the app crashing.
3. As a merchant, I want to switch from Operations to another view, so that I
   can read my analytics or manage products — without the app crashing.
4. As a merchant, I want to save a brand-new product and stay on its detail
   screen, so that I can keep editing it — without the app crashing.
5. As a developer, I want a regression lock, so that a future screen cannot
   reintroduce the same crash by reaching for `router.replace()`.

## Task report

### 1. Reproduce the crash mechanism (RED)

Added `lib/tab-navigation.test.ts`, which drives expo-router's **real,
unmodified** `tabRouterOverride` and asserts that REPLACE renames the
navigator's state key while NAVIGATE does not. The base router is faked because
`@react-navigation/routers` ships ESM-only and cannot load under this package's
node-environment Jest config — but the behaviour under test (the key rewrite)
lives entirely in expo-router's own module, which is loaded for real.

The same file adds a source guardrail scanning every `.tsx` under `app/(main)/`
plus `components/WorkspaceSwitcher.tsx` for `router.replace` into `/(main)`.

Command: `npx jest lib/tab-navigation.test.ts`

First run — compile-time RED (implementation absent):

```
lib/tab-navigation.test.ts:26:61 - error TS2307: Cannot find module './tab-navigation'
Test Suites: 1 failed, 1 total
```

After adding the pure module, runtime RED against the real defect:

```
✕ webnegosyo-app/app/(main)/dashboard.tsx does not call router.replace into /(main)
✕ webnegosyo-app/app/(main)/pos-tender.tsx does not call router.replace into /(main)
✕ webnegosyo-app/app/(main)/product/[productId].tsx does not call router.replace into /(main)
✕ webnegosyo-app/app/(main)/scan.tsx does not call router.replace into /(main)
✕ webnegosyo-app/components/WorkspaceSwitcher.tsx does not call router.replace into /(main)

Tests:       5 failed, 22 passed, 27 total
```

Checkpoint: `b6cf553 test: add reproducer for the tab navigator's stale-state crash`

### 2. Fix the call sites (GREEN)

Added `lib/tab-navigation.ts` — a pure module exporting `isTabNavigatorHref`,
`navigationVerbFor`, and `goTo(router, href)`. `goTo` navigates within the tab
tree and keeps replace semantics for hrefs that leave it. It is generic over the
href type so it composes with expo-router's generated typed routes rather than
widening them to `string`.

Five call sites converted:

| File | Was | Journey |
|---|---|---|
| `app/(main)/pos-tender.tsx:213` | `router.replace("/(main)/pos-sales")` | 1 |
| `app/(main)/scan.tsx:227` | `router.replace("/(main)/orders")` | 2 |
| `components/WorkspaceSwitcher.tsx:42` | ``router.replace(`/(main)/${landingTab}`)`` | 3 |
| `app/(main)/product/[productId].tsx:200` | `router.replace(productHref(created.id))` | 4 |
| `app/(main)/dashboard.tsx:194` | `router.replace("/(main)/dashboard")` | — |

The dashboard one is a retry button replacing the tab with itself; dashboard is
index 0 today so the override's `index !== 0` guard spares it, but it is the
same latent bug and would fire if the tab order ever changed.

Command: `npx jest lib/tab-navigation.test.ts`

```
Test Suites: 1 passed, 1 total
Tests:       28 passed, 28 total
```

Command: `npx tsc --noEmit` → clean, no output.

Checkpoint: `c8ceb33 fix: stop replacing into the merchant tab navigator`

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A REPLACE into the tab navigator renames its state key to `${key}-replace` — the remount that crashes the app | `lib/tab-navigation.test.ts:renames the navigator's state key on a REPLACE into the same navigator` | unit (real expo-router module) | PASS |
| 2 | A NAVIGATE reaches the same destination with the navigator's key intact | `lib/tab-navigation.test.ts:keeps the navigator's state key on a NAVIGATE into the same navigator` | unit (real expo-router module) | PASS |
| 3 | In-navigator hrefs resolve to the `navigate` verb | `lib/tab-navigation.test.ts:routes an in-navigator href through navigate` | unit | PASS |
| 4 | Cross-group hrefs keep the `replace` verb, so leaving the tab tree still drops the screen behind it | `lib/tab-navigation.test.ts:routes a cross-group href through replace` | unit | PASS |
| 5 | Dynamic in-navigator routes (`/(main)/product/<id>`) are treated as in-navigator | `lib/tab-navigation.test.ts:treats a dynamic in-navigator route as in-navigator` | unit | PASS |
| 6 | A lookalike prefix (`/(mainframe)/x`) is not mistaken for the tab group | `lib/tab-navigation.test.ts:rejects other groups and lookalike prefixes` | unit | PASS |
| 7 | `goTo` dispatches navigate — and never replace — within the tab navigator | `lib/tab-navigation.test.ts:navigates rather than replaces within the tab navigator` | unit | PASS |
| 8 | `goTo` still dispatches replace when leaving the tab navigator | `lib/tab-navigation.test.ts:still replaces when leaving the tab navigator` | unit | PASS |
| 9 | No screen under `app/(main)/` nor `WorkspaceSwitcher` calls `router.replace` into `/(main)` (19 files) | `lib/tab-navigation.test.ts:no screen replaces into the merchant tab navigator` | guardrail | PASS |

## Coverage

```
npx jest lib/tab-navigation.test.ts --coverage --collectCoverageFrom='lib/tab-navigation.ts'

File               | % Stmts | % Branch | % Funcs | % Lines
 tab-navigation.ts |     100 |      100 |     100 |     100
```

`npx eslint` on all six changed files: **0 errors**, 3 pre-existing warnings
(`react-hooks/exhaustive-deps` ×2, `jsx-a11y/alt-text` ×1) on lines unrelated to
this change.

## Known gaps

- **Not verified on a device.** The fix is proven at the router-action level and
  by static guardrail, not by launching the app and completing a POS sale. The
  crash chain's steps 3–5 are read from library source rather than executed,
  because reproducing them needs a mounted navigator that this package's Jest
  config (node environment, `lib/` + `theme/` roots only) cannot host.
- The guardrail is a source scan, matching the existing `*-mount.test.ts`
  convention in `lib/`. It catches `router.replace("/(main)…")` and
  `router.replace(productHref(…))`; a new href builder for an in-navigator route
  would need adding to that pattern.
- The `(superadmin)` tab tree was checked for the same defect and has none.
- `components/WorkspaceSwitcher.tsx` needs a cast on the router, because
  expo-router's generated `Href` union lists tabs literally and a computed
  `` `/(main)/${tab}` `` template cannot match it. The previous `router.replace`
  needed `as never` at the same spot for the same reason.

## Unrelated failures observed

`npx jest` (full suite) reports **2 failures in `lib/staff-permissions.test.ts`**
that are **not** from this work. A concurrent session edited `lib/workspaces.ts`
and `lib/staff-permissions.ts` to add a `branches` tab to the Insights view;
`allowedWorkspaces` assertions still expect the old tab lists. Those files were
not staged in either checkpoint commit here.

Excluding that pre-existing breakage: **66 suites passed, 1068 tests passed.**
