const { withPodfile } = require("@expo/config-plugins");

// react-native-thermal-printer vendors a pre-2020 fat static library
// (ios/PrinterSDK/libPrinterSDK.a) whose arm64 slice was built for physical
// iOS devices only, causing "building for iOS-simulator, but linking in
// object file built for iOS" on any Simulator build (Apple Silicon Simulators
// are arm64-only — there is no Rosetta/x86_64 destination to fall back to on
// current Xcode). Printing needs real Bluetooth/network printer hardware
// anyway, so it's unusable in the Simulator regardless. When
// EXPO_SIMULATOR_BUILD=1 is set at `pod install` time, this drops the module
// from iOS autolinking entirely so Simulator builds link cleanly. Device and
// EAS builds never set this var, so production printing is untouched.
// lib/printer.ts already lazy-requires the native module in a try/catch
// (the same fallback path used for Expo Go), so its absence here is a no-op,
// not a crash.
const EXCLUDE_HOOK = `  config_command += ['--exclude', '@haroldtran/react-native-thermal-printer'] if ENV['EXPO_SIMULATOR_BUILD'] == '1'\n`;

function withThermalPrinterSimulatorFix(config) {
  return withPodfile(config, (config) => {
    const { contents } = config.modResults;

    if (contents.includes(EXCLUDE_HOOK)) {
      return config;
    }

    config.modResults.contents = contents.replace(
      /(\n  config = use_native_modules!\(config_command\)\n)/,
      `\n${EXCLUDE_HOOK}$1`
    );

    return config;
  });
}

module.exports = withThermalPrinterSimulatorFix;
