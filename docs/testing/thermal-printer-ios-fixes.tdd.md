# TDD Evidence — Thermal printer failures on iOS/iPad and connection hangs

**Date:** 2026-08-17
**Source plan:** none — journeys derived during this TDD run from the report
"thermal printer not working on some devices, including iPad; sometimes it's
not even connecting."

## User journeys

1. As a merchant using an iPad with a Bluetooth thermal printer, I want
   receipts to actually print, so kitchen tickets come out on order confirm.
2. As a merchant with a Wi-Fi/LAN printer, I want the app to connect to it at
   all, so I can print without Bluetooth.
3. As a merchant who relaunched the app, I want my saved printer to reconnect
   automatically when a receipt prints, without rescanning by hand.
4. As a merchant scanning with no printer in range, I want the scan to finish
   with "No printers found" instead of spinning forever.

## Root causes

| # | Defect | Where |
|---|--------|-------|
| 1 | iOS BLE path sends plain text; native `RNBLEPrinter.m printRawData:` base64-decodes it (`initWithBase64EncodedString`) → nil → blank receipt. Android base64-encodes, hence "works on some devices". | library JS `src/index.tsx` |
| 2 | `NetPrinter.connectPrinter` preflights with `react-native-ping` — a NESTED dependency that is never autolinked, so its native module is absent and `Ping.start` throws → every network connect rejects. | library JS `src/index.tsx` |
| 3 | iOS `getDeviceList` only calls back when a printer is discovered (never settles otherwise); native connect only knows printers scanned since launch, so a saved printer fails to reconnect after relaunch. No timeouts existed. | `webnegosyo-app/lib/printer.ts` |

## Task report

- **iOS BLE base64 encoding** — patched the library (patch-package) to
  base64-encode text on all four iOS BLE print paths, matching the native
  decode. RED: `printer-ios-ble-base64.test.ts` failed (plain text does not
  survive a strict base64 round-trip). GREEN after patch.
- **Network connect ping preflight removed** — patched
  `NetPrinter.connectPrinter` to call the native module directly. RED:
  `printer-net-connect.test.ts` rejected when ping throws. GREEN after patch.
- **Timeouts + rescan-retry** — `lib/printer.ts` wraps init/scan/connect in
  `withTimeout` (12s scan, 10s connect) and, on a failed Bluetooth connect,
  rescans once and retries (post-relaunch recovery). RED:
  `printer-resilience.test.ts` — two tests exceeded the jest timeout (real
  hang) and the retry test returned `success: false`. GREEN after fix.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | iOS BLE `printBill` output survives the native strict base64 decode round-trip | `lib/printer-ios-ble-base64.test.ts` | unit (real library, mocked native) | PASS |
| 2 | iOS BLE `printText` output survives the same round-trip | `lib/printer-ios-ble-base64.test.ts` | unit | PASS |
| 3 | Network connect succeeds even when react-native-ping is unavailable | `lib/printer-net-connect.test.ts` | unit | PASS |
| 4 | Scan resolves to `[]` instead of hanging when no printer is ever discovered | `lib/printer-resilience.test.ts` | unit | PASS |
| 5 | BT connect returns a `timed out` failure instead of hanging when native never calls back | `lib/printer-resilience.test.ts` | unit | PASS |
| 6 | BT connect rescans + retries once when a saved printer is unknown post-relaunch | `lib/printer-resilience.test.ts` | unit | PASS |
| 7 | Network connect returns a `timed out` failure instead of hanging | `lib/printer-resilience.test.ts` | unit | PASS |
| 8 | Library still loads with native modules absent (pre-existing guard, unregressed) | `lib/printer-native-load.test.ts` | unit | PASS |

Evidence commands: `npx jest lib/printer-*.test.ts --selectProjects logic`
(10/10 pass), full run `npx jest` — 178 logic suites / 2709 tests + 4
component suites / 51 tests, all pass. `npm run lint` — 0 errors (6
pre-existing warnings, none in touched files).

## Coverage and known gaps

- webnegosyo-app has no coverage script; the three new suites exercise every
  changed branch of `lib/printer.ts` and both patched library paths.
- The iOS native `getDeviceList` resolving on the FIRST discovery only (later
  printers never surface in one scan) is a native-code limitation — not fixable
  from JS; the merchant can tap Scan again. A native patch would need a new
  binary.
- Hardware verification on a physical iPad + BT printer is still required —
  unit tests prove the byte-level contract, not paper output.

## Merge evidence

Checkpoint commits on `main`:
- `test: RED reproducers for thermal printer failures on iOS/iPad` (7 tests failing for the intended reasons)
- `fix: thermal printing on iPad/iPhone and printer connection hangs` (all green)

## Rollout

Both library fixes live in patched **JS** (`patches/@haroldtran+react-native-thermal-printer+1.1.1.patch`)
and `lib/printer.ts` — all bundle code, so `eas update --branch production`
reaches existing installs OTA. No new native binary is required.
