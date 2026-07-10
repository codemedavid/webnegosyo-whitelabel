# TDD Evidence — iOS `NativeEventEmitter` non-null crash on Printer Settings

**Date:** 2026-07-09
**Scope:** `webnegosyo-app` (merchant admin)
**Source plan:** none — journeys derived during this TDD run from a runtime crash report (simulator red box).

## Problem

Opening the **Printer Settings** screen on the iOS Simulator crashed with:

```
Uncaught Error
`new NativeEventEmitter()` requires a non-null argument.
  at NativeEventEmitter
  at @haroldtran/react-native-thermal-printer/src/index.tsx
  at checkPrinterAvailable → isPrinterSupported → PrinterSettingsScreen
```

### Root cause

`@haroldtran/react-native-thermal-printer/src/index.tsx:603-606` builds a
module-level `NativeEventEmitter` for the network printer **at `require()`
time**, unconditionally on iOS:

```ts
const NetPrinterEventEmitter =
  Platform.OS === "ios"
    ? new NativeEventEmitter(RNNetPrinter) // RNNetPrinter is null on the simulator → throws
    : new NativeEventEmitter();
```

On the iOS Simulator (and any build where the native module fails to register),
`NativeModules.RNNetPrinter` is `null`, and on iOS `NativeEventEmitter` throws
when given a null module. Because the throw happens during **module
evaluation**, it escapes the `try/catch` guarding `require()` in
`lib/printer.ts` and surfaces as a dev red box, crashing the screen.

## User journeys

1. As a merchant, I want to open Printer Settings on any build (including the
   simulator) without the app crashing, so I can configure printing.
2. As a merchant on a device where the printer native module is unavailable, I
   want the printer library to load and expose its printer objects for
   feature-detection instead of crashing at import.

## Fix

Patched the library (persisted via `patch-package`) to guard the emitter:

`patches/@haroldtran+react-native-thermal-printer+1.1.1.patch`

```ts
const NetPrinterEventEmitter =
  Platform.OS === "ios"
    ? RNNetPrinter
      ? new NativeEventEmitter(RNNetPrinter)
      : undefined            // native module absent (simulator / unregistered)
    : new NativeEventEmitter();
```

On real devices `RNNetPrinter` is present, so behavior is unchanged. No app code
uses `NetPrinterEventEmitter`, so `undefined` is safe. `postinstall` already runs
`patch-package`, so the fix survives `npm install`.

## Task report

| Step | Summary | Command | Result |
|------|---------|---------|--------|
| RED | New test loads the real library with native modules mocked absent on iOS; require throws at `index.tsx:605` | `npx jest printer-native-load` | FAIL (invariant thrown at the exact crash site) |
| GREEN | Applied the guard patch; require no longer throws, emitter is `undefined` | `npx jest printer-native-load` | PASS (3/3) |
| Regression | Full suite unaffected | `npx jest` | PASS (14 suites, 190 tests) |
| Runtime | Native rebuild + launch on iPhone 17 Pro simulator | `npx expo run:ios` | Build Succeeded; `iOS Bundled … (1393 modules)`; app launched to dashboard with no `NativeEventEmitter` error |

### RED evidence (before patch)

```
`new NativeEventEmitter()` requires a non-null argument.
  at new NativeEventEmitter (lib/printer-native-load.test.ts:26:17)
  at Object.<anonymous> (node_modules/@haroldtran/react-native-thermal-printer/src/index.tsx:605:7)
```

### GREEN evidence (after patch)

```
PASS lib/printer-native-load.test.ts
  ✓ does not throw when RNNetPrinter is absent on iOS
  ✓ exposes an undefined NetPrinterEventEmitter instead of crashing
  ✓ still exports the printer instances so callers can feature-detect
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Requiring the printer library does not throw when RNNetPrinter is absent on iOS | `lib/printer-native-load.test.ts` | unit/regression | PASS |
| 2 | `NetPrinterEventEmitter` is `undefined` (not a crash) when the native module is missing | `lib/printer-native-load.test.ts` | unit/regression | PASS |
| 3 | `BLEPrinter` / `NetPrinter` are still exported so `lib/printer.ts` can feature-detect | `lib/printer-native-load.test.ts` | unit/regression | PASS |

## Coverage and known gaps

- Test infra: `jest.config.js` now transforms this one library from source
  (`transformIgnorePatterns` allowlist) and skips type diagnostics for
  `node_modules` (`diagnostics.exclude`) so the third-party source compiles;
  our own `lib`/`theme` code is still fully type-checked.
- Not automated: the final on-screen render of `PrinterSettingsScreen` in the
  simulator (no headless tap tool available in this environment). The crash was
  deterministic at library `require()` (module-load), which test #1 exercises
  directly against the real file, so this path is covered. Manual UI
  confirmation: open the app → tap **Printer** in the header → screen renders
  without a red box.

## Files changed

- `patches/@haroldtran+react-native-thermal-printer+1.1.1.patch` (new — the fix)
- `lib/printer-native-load.test.ts` (new — regression test)
- `jest.config.js` (transform allowlist + diagnostics exclude for node_modules)
