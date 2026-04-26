# iOS Crash Fix Changes

Date: 2026-04-26

## Summary

Implemented the iOS launch crash mitigations from `IOS_CRASH_FIX_PLAN.md` for the merchant admin app.

## Changes Made

- Added iOS privacy usage descriptions in `app.config.ts`:
  - `NSBluetoothAlwaysUsageDescription`
  - `NSBluetoothPeripheralUsageDescription`
  - `NSLocalNetworkUsageDescription`
- Updated `react-native-screens` from `~4.16.0` to `^4.24.0` with npm, updating `package.json` and `package-lock.json`.
- Added `react-native.config.js` to exclude `@haroldtran/react-native-thermal-printer` from iOS autolinking.
- Updated `lib/printer.ts` so iOS returns printer unavailable before requiring the native thermal-printer module.
- Hid the dashboard printer-settings shortcut on iOS in `app/(main)/dashboard.tsx`.

## Notes

- `npx expo install --check` still reports `react-native-screens@4.24.0` as newer than Expo SDK 54's expected `~4.16.0`. This is intentional because the crash plan calls for a newer `react-native-screens` version with iPadOS 26 navigation fixes.
- The printer feature remains available on Android.
- iOS printer support is disabled until it can be verified on a physical iPadOS 26 device.
