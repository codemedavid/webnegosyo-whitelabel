// Native module autolinking uses the Expo/React Native defaults — the
// thermal-printer module is linked on BOTH iOS and Android.
//
// History: this module was briefly excluded from iOS to work around an iPadOS
// launch crash (App Review 2.1a). The real cause was a missing Bluetooth usage
// description in Info.plist, which is now declared in app.config.ts
// (NSBluetoothAlwaysUsageDescription / NSBluetoothPeripheralUsageDescription /
// NSLocalNetworkUsageDescription), so iOS printing is re-enabled.
module.exports = {
  dependencies: {},
};
