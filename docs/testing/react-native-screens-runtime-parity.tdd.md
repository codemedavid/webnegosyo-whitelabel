# TDD evidence — react-native-screens runtime parity

Fixes: `ERROR [Error: Exception in HostFunction: TypeError: expected dynamic type 'boolean', but had type 'string']`
reported at `webnegosyo-app/app/_layout.tsx:331` (`<Stack screenOptions={{ headerShown: false }}>`).

## Source plan

No `*.plan.md`. Journeys derived during this TDD run, continuing the reproducer
committed in `fbb272b3`.

## Root cause

`react-native-screens` retyped the `RNSScreen` prop `fullScreenSwipeEnabled`
between 4.16 (`boolean`) and 4.24 (the string enum `'undefined' | 'true' | 'false'`).
`Screen.tsx` sends the string form from 4.17 onwards, so a JS bundle at 4.24
driving a native binary compiled from 4.16 throws on the first Fabric commit of
the screen stack. React attributes the throw to the nearest owning component —
`<Stack>` in `app/_layout.tsx` — so it presents as a routing bug and is not one.
Expo Go for SDK 54 ships 4.16 natively and cannot be changed.

Verified in this repo: `package.json`, `node_modules/react-native-screens` and
`ios/Podfile.lock` all say `4.24.0`, i.e. the JS pin has NOT drifted. The crash
therefore comes from the *client* the bundle is loaded into — Expo Go, or a
stale development build. The fix is to run a current development build:

```
npx expo run:ios          # or run:android
npx expo start --dev-client   # if it is already installed
```

Do not "fix" this by downgrading `react-native-screens`; the 4.24.0 pin is
deliberate (commit `551c0459`, iPadOS 26 navigation fixes) and
`npx expo install --check` will keep advising the wrong downgrade.

## User journeys

- As a developer, when I launch the merchant app in Expo Go, I want to be told
  that the runtime is unsupported and how to get a working one, so that I do not
  chase a phantom bug in `app/_layout.tsx`.
- As a maintainer, I want the `react-native-screens` pin held identical across
  `package.json`, `node_modules` and the iOS `Podfile.lock`, so that the JS
  bundle can never silently drift from the native binary again.

## Task report

| Task | Summary | Command | Result |
|---|---|---|---|
| Confirm the pin has not drifted | package.json / node_modules / Podfile.lock all read 4.24.0 | `npx jest lib/native-runtime-parity.test.ts` | PASS (10 tests, pre-existing reproducer) |
| Make the misdiagnosis impossible | RED: `warnAboutScreensRuntime` missing and layout unwired | `npx jest lib/native-runtime-parity.test.ts` | RED — `TS2305: Module has no exported member 'warnAboutScreensRuntime'` |
| Wire the warning in | Emitter added; called at module scope in `app/_layout.tsx` before any screen renders | `npx jest lib/native-runtime-parity.test.ts` | GREEN — 14 passed |
| Guard the whole app | No regressions | `npx tsc --noEmit`, `npx jest` | clean; 239 suites / 3349 tests passed |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The RNScreens pod version is read out of a Podfile.lock, not its subspec line | `lib/native-runtime-parity.test.ts:parsePodfileLockScreensVersion` | unit | PASS |
| 2 | `react-native-screens` is pinned exactly in package.json | `…:is pinned exactly in package.json` | unit | PASS |
| 3 | The installed version matches the pin | `…:matches the version actually installed in node_modules` | unit | PASS |
| 4 | The iOS pod matches the pin (skipped when `ios/` is absent) | `…:matches the RNScreens pod the iOS project is built from` | unit | PASS |
| 5 | Expo Go is named, with the crash text and the way out | `…:names Expo Go, the crash and the way out` | unit | PASS |
| 6 | Silent in dev builds, when appOwnership is unknown, and in production | `screensRuntimeWarning` silence cases | unit | PASS |
| 7 | The warning is emitted through the logger in Expo Go, and only there | `warnAboutScreensRuntime` | unit | PASS |
| 8 | `app/_layout.tsx` actually runs the check, at module scope | `root layout wiring` | guardrail | PASS |

## Coverage and known gaps

Full suite: `npx jest` — 239 suites / 3349 tests passed. Coverage was not run
separately; the changed surface (`lib/native-runtime-parity.ts`, the layout call
site) is fully exercised by the table above.

Gaps, deliberate:
- The warning only detects Expo Go (`Constants.appOwnership === "expo"`). A
  *stale development build* — native 4.16 installed on the device, JS at 4.24 —
  produces the same crash and cannot be detected from JS, since the native
  module exposes no version. Rebuilding the client is the fix in both cases.
- The `Podfile.lock` assertion no-ops on machines that have never run a native
  build, because `ios/` is prebuild output and gitignored.

## Merge evidence

RED `b6c06aa1` → GREEN `7f713aa7`. No refactor commit; the implementation was
already minimal. Copy this section into the PR body if the branch is squashed.
