# iOS Launch Crash Fix Plan — App Store Build 1.0(8)

## Context

Apple App Review rejected build `1.0 (8)` of the **merchant admin app** (`webnegosyo-app/`, bundle ID `com.webnegosyo.admin`) under Guideline 2.1(a) — Performance / App Completeness. The app crashes on launch on iPad Air 11" (M3) running iPadOS 26.4.1.

- Submission ID: `1c41f120-0bfb-4623-a463-9bcc0fd5d889`
- Review date: 2026-04-24
- Crash log: `/Users/jeremie/Downloads/crashlog-5687F61D-27E0-448B-8C3C-2627964B3AB8.ips`

> Note: This is the merchant admin app at `webnegosyo-app/`, NOT the white-labeled customer app at `mobile/`. Do not modify `mobile/`.

## Root Cause Analysis

From the `.ips` crash log:

- **Exception:** `EXC_CRASH (SIGABRT)`
- **Triggered thread (#11):** `com.meta.react.turbomodulemanager.queue`
  - Stack: `ObjCTurboModule::performVoidMethodInvocation` → `objc_exception_rethrow` → `__cxa_rethrow` → `std::__terminate` → `abort()`
- **Main thread (#0):** mid-`-[UINavigationController setViewControllers:animated:]` → `-[UINavigationBar layoutSubviews]` → `String._unconditionallyBridgeFromObjectiveC(_:)` (Swift bridging `NSString` → `String`)

Interpretation: a native TurboModule method raised an unhandled Objective-C exception during the very first navigation mount. The runtime rethrows it, `std::terminate` runs, `abort()` is called.

**Primary suspect:** `@haroldtran/react-native-thermal-printer@^1.1.1` (declared in `webnegosyo-app/package.json`).

- The library is autolinked, so its native module registers at launch even though `webnegosyo-app/lib/printer.ts` lazy-`require`s the JS side.
- The library touches CoreBluetooth.
- `webnegosyo-app/app.config.ts` does **not** declare `NSBluetoothAlwaysUsageDescription` / `NSBluetoothPeripheralUsageDescription` in `ios.infoPlist`.
- iOS 26 SIGABRTs any process that touches a privacy-protected API without the matching Info.plist key. Trace pattern (TurboModule queue → ObjC exception → terminate during initial mount) matches exactly.

**Secondary suspect:** `react-native-screens@~4.16.0` had documented iOS 26 / iPad navigation-bar crashes matching the main-thread `UINavigationBar layoutSubviews` → String bridging frames.

## Fix Plan (Priority Order)

### Step 1 — Add Bluetooth + Local Network usage descriptions

**File:** `webnegosyo-app/app.config.ts`

Update the `ios.infoPlist` block:

```ts
ios: {
  supportsTablet: true,
  bundleIdentifier: "com.webnegosyo.admin",
  infoPlist: {
    ITSAppUsesNonExemptEncryption: false,
    NSBluetoothAlwaysUsageDescription:
      "Used to connect to your thermal receipt printer over Bluetooth.",
    NSBluetoothPeripheralUsageDescription:
      "Used to connect to your thermal receipt printer over Bluetooth.",
    NSLocalNetworkUsageDescription:
      "Used to connect to network thermal printers on your local network.",
  },
},
```

Rationale: Even when the user never connects a printer, autolinked native code can probe these subsystems at launch. Declaring the keys is required by iOS 26 and makes the privacy prompt correct when the merchant later pairs a printer.

### Step 2 — Update `react-native-screens` and align SDK 54 deps

In `webnegosyo-app/`:

```bash
npx expo install react-native-screens@latest
npx expo install --check
```

Expected outcome: `react-native-screens` moves to ≥ 4.17.x with iOS 26 navigation-bar fixes; other Expo SDK 54 packages are aligned to compatible versions.

### Step 3 — (Conditional) Gate the thermal printer to Android-only

If steps 1–2 do not resolve the crash on a real iPad running iPadOS 26, fall back to making `@haroldtran/react-native-thermal-printer` Android-only. App Store reviewers will never have a printer paired, and the merchant admin app's printer feature is in-store only.

Two options — choose one:

**Option A — runtime guard (simpler, ship-fast):**
- In `webnegosyo-app/lib/printer.ts`, short-circuit `checkPrinterAvailable()` to return `false` when `Platform.OS === "ios"` for now.
- Hide the printer-settings entry point in the iOS UI.

**Option B — exclude from iOS autolinking (cleaner):**
- Add a `react-native.config.js` in `webnegosyo-app/` that excludes the module on iOS:
  ```js
  module.exports = {
    dependencies: {
      "@haroldtran/react-native-thermal-printer": {
        platforms: { ios: null },
      },
    },
  };
  ```
- Rebuild prebuild/EAS so iOS Pod no longer includes the library.

### Step 4 — Verify locally before resubmission

1. Run a production-like build on a physical iPad (or at least an M-series iPad simulator on iPadOS 26 if available):
   ```bash
   eas build --platform ios --profile preview
   ```
   or use `expo prebuild` + `xcodebuild` archive for a faster local loop.
2. Install on device, launch cold, confirm:
   - App opens to the splash → login flow without crashing.
   - No CoreBluetooth / privacy crash in Console.app device logs.
   - Navigation between Login → Dashboard → Orders works.
3. If physical iPad isn't available, at minimum test on iPad simulator with iOS 26 SDK in Xcode.

### Step 5 — Bump build, archive, resubmit

1. Bump `ios.buildNumber` (EAS auto-increments via `production` profile, but verify).
2. `eas build --platform ios --profile production`.
3. `eas submit --platform ios --profile production`.
4. In App Store Connect, reply to the rejection thread referencing the new build and summarize the fix:
   > Build N addresses the launch crash by adding the required `NSBluetoothAlwaysUsageDescription` Info.plist key (the merchant-side thermal printer integration uses CoreBluetooth) and updating `react-native-screens` for iPadOS 26 compatibility.

## Files to Touch

- `webnegosyo-app/app.config.ts` — add Info.plist keys (Step 1).
- `webnegosyo-app/package.json` + lockfile — `react-native-screens` bump (Step 2).
- `webnegosyo-app/lib/printer.ts` *or* new `webnegosyo-app/react-native.config.js` — only if Step 3 is needed.

## Out of Scope

- The customer white-label app at `mobile/` (different bundle, different EAS project).
- Convex / Supabase backend changes.
- Any feature work on dashboard, orders, analytics, trends.

## Acceptance Criteria

- Cold launch on iPad Air M3 / iPadOS 26.4.1 reaches the login screen without crashing.
- No SIGABRT in device console during launch.
- New build accepted by Apple App Review.
