# iOS thermal printer never detects a printer — TDD evidence

**Source plan:** none. Journeys derived during this TDD run from the reported
symptom: *"the thermal printer on iOS keeps on loading only and doesn't detect
any printer, but on Android it's working properly."*

**Branch:** `main` · RED `1b9daf6` → GREEN `95427f7`

## User journeys

1. As a merchant on iPhone/iPad, I want tapping **Scan** to find my Bluetooth
   printer, so that I can print receipts the way Android merchants already do.
2. As a merchant, when no printer is found I want to be told *which* thing is
   wrong — Bluetooth off, printer not in range, or an app build without
   printing — so that I stop checking the printer when the fault is elsewhere.
3. As an Android merchant, I want scanning to stay exactly as fast as it is now.

## Root cause

Three defects, all iOS-only, compounding into one symptom.

**1. The scan is issued before CoreBluetooth is powered on.**
`node_modules/@haroldtran/react-native-thermal-printer/ios/RNBLEPrinter.m:21-22`
ships the defect in its own comment:

```objc
// API MISUSE: <CBCentralManager> can only accept this command while in the powered on state
[[PrinterSDK defaultPrinterSDK] scanPrintersWithCompletion:^(Printer* printer){}];
```

`lib/printer.ts` called `init()` and then `getDeviceList()` milliseconds later.
A `CBCentralManager` needs roughly 0.5–2s to reach `CBManagerStatePoweredOn`
after instantiation, and iOS **silently discards** any scan issued before that
— no error, no callback, no devices. The first scan after an app launch
therefore never actually started.

**2. `getDeviceList` never called back on an empty scan.** Its
`successCallback` fired only from *inside* the per-printer discovery block
(`RNBLEPrinter.m:38-47`). With nothing discovered the block never ran, so the
promise hung until our 12s timeout. **That hang is the "keeps on loading".**

**3. The callback was invoked once per printer.** `RCTResponseSenderBlock` is
single-shot; a second invocation raises *"Callback was already invoked"*. The
mapping loop also read the outer `printer` variable instead of the enumerated
`obj` (`RNBLEPrinter.m:42`), so a two-printer scan returned the same printer
twice.

Android is unaffected: `getDeviceList` resolves synchronously from the bonded
device list, with no power-state machine and no discovery callback.

## Task report

| Task | Validation command | Result |
|---|---|---|
| Reproduce the iOS scan failure as tests | `npx jest lib/printer-ios-scan.test.ts` | **RED — 6 failed, 6 total** |
| Fix native `getDeviceList` (always answer, answer once, dedupe correctly) | regenerated `patches/@haroldtran+react-native-thermal-printer+1.1.1.patch` | patch now covers `ios/RNBLEPrinter.m` |
| Fix JS scan (warm-up, retry, structured status) | `npx jest lib/printer-ios-scan.test.ts` | **GREEN — 6 passed, 6 total** |
| No regression across the app | `npx jest` | 2862 passed, 1 pre-existing unrelated failure |
| Types + lint on changed files | `npx tsc --noEmit`, `npx eslint …` | 0 errors (1 pre-existing `COMMANDS` unused warning) |

RED excerpt:

```
✕ waits for CoreBluetooth to power on before the first iOS scan
✕ retries the scan when an iOS scan window is dropped and never calls back
✕ reports a timeout status, not a bare empty list, when every iOS scan window is dropped
✕ reports an empty-but-successful scan distinctly from a dropped scan
✕ reports unavailable when the native module is missing from the build
✕ does not impose the iOS warm-up delay on Android
Tests: 6 failed, 6 total
```

GREEN excerpt:

```
✓ waits for CoreBluetooth to power on before the first iOS scan (86 ms)
✓ retries the scan when an iOS scan window is dropped and never calls back (17 ms)
✓ reports a timeout status, not a bare empty list, when every iOS scan window is dropped (7 ms)
✓ reports an empty-but-successful scan distinctly from a dropped scan (1 ms)
✓ reports unavailable when the native module is missing from the build (1 ms)
✓ does not impose the iOS warm-up delay on Android (1 ms)
Tests: 6 passed, 6 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | iOS does not scan until CoreBluetooth has had time to power on | `lib/printer-ios-scan.test.ts:waits for CoreBluetooth to power on before the first iOS scan` | unit | PASS |
| 2 | A dropped iOS scan window is retried, and a printer found in a later window is returned | `lib/printer-ios-scan.test.ts:retries the scan when an iOS scan window is dropped` | unit | PASS |
| 3 | Every-window-dropped reports `timeout`, never a bare empty list | `lib/printer-ios-scan.test.ts:reports a timeout status, not a bare empty list` | unit | PASS |
| 4 | A genuine empty scan reports `ok`, distinct from a dropped one | `lib/printer-ios-scan.test.ts:reports an empty-but-successful scan distinctly` | unit | PASS |
| 5 | A build missing the native pod reports `unavailable`, not "no printers in range" | `lib/printer-ios-scan.test.ts:reports unavailable when the native module is missing` | unit | PASS |
| 6 | Android still scans immediately — no warm-up, no retries | `lib/printer-ios-scan.test.ts:does not impose the iOS warm-up delay on Android` | unit | PASS |
| 7 | Scanning settles rather than hanging when no printer is ever discovered | `lib/printer-resilience.test.ts:discoverBluetoothPrinters settles instead of hanging` | unit | PASS |

## Coverage and known gaps

- **Not verified on hardware.** No physical iPhone/iPad with a Bluetooth
  printer was available in this session. The native `RNBLEPrinter.m` change is
  covered by reasoning against the CoreBluetooth contract and the vendor's own
  `API MISUSE` comment, **not** by an executed test — Objective-C is outside the
  Jest harness. This is the one claim in this document that rests on analysis
  rather than a green test.
- **The native half needs a new EAS build.** `patches/` changes are compiled,
  not OTA-able. The JS half (warm-up + retry + status) ships over the air and
  improves already-installed builds on its own, because the retry is what
  recovers the launch race against the unpatched native module.
- **`ios/Podfile.lock` contains no `react-native-thermal-printer` pod** — only
  its nested `react-native-ping` (lines 2225, 2397). That lock was generated
  with `EXPO_SIMULATOR_BUILD=1`, which activates the `--exclude` in
  `ios/Podfile:42`. EAS runs a fresh `pod install` and will re-add the pod, so
  this is not believed to affect shipped builds, but the committed lock is
  wrong and a `pod install --deployment` would build an app with no printer
  module at all. Left unfixed: regenerating it needs CocoaPods and the machine
  is at 100% disk.
- **Bluetooth Classic printers cannot work on iOS at all.** iOS only talks to
  Bluetooth LE peripherals (or MFi-certified Classic ones). A cheap SPP-only
  thermal printer that pairs fine on Android is invisible to iPhone/iPad by
  platform design — no code change can fix that, so the "No Printers Found"
  message now says so.
- `requestBluetoothPermissions` still returns unconditional success on iOS; the
  native module exposes no `CBManager` authorization state to query. The
  `timeout` status is the proxy for "Bluetooth is off or denied".
- `connectPrinter`'s post-relaunch rescan still calls `getDeviceList` directly
  rather than routing through the new retry path. Out of scope for this fix
  (detection, not connection) and already covered by its own timeout test.
- Pre-existing unrelated failure on `main`:
  `components/pos/DiscountSheet.test.tsx › a code the engine accepts › puts a
  named discount row on the sale for the right money`. Both that test and its
  component are clean in this working tree and contain no printer references.
- The machine reported `ENOSPC` (439Mi free on a 460Gi volume) during the first
  full run, failing one suite for disk reasons; clearing the Jest transform
  cache resolved it.

## Merge evidence

RED `1b9daf6` (6/6 failing reproducer) → GREEN `95427f7` (6/6 passing, 2862
passing overall). No refactor commit: the implementation landed in its final
shape. If squashed, retain this file as the record.
