/**
 * Guardrail for the iOS Simulator link failure:
 *
 *   ld: building for 'iOS-simulator', but linking in object file
 *   (…/@haroldtran/react-native-thermal-printer/ios/PrinterSDK/
 *    libPrinterSDK.a[arm64][2](GCDAsyncSocket.o)) built for 'iOS'
 *
 * The vendored printer SDK is a pre-2020 fat static library whose arm64 slice
 * targets physical devices only, and Apple Silicon Simulators are arm64-only,
 * so there is no slice to fall back to. `plugins/withThermalPrinterSimulatorFix.js`
 * already solves it by dropping the module from autolinking — but only when
 * `EXPO_SIMULATOR_BUILD=1` is set at `pod install` time.
 *
 * That flag was documented in a code comment and nowhere else, so the obvious
 * command (`npm run ios`) reproduces the failure every time and the fix has to
 * be rediscovered. These tests keep a Simulator script next to the device one.
 */
import { readFileSync } from "fs";
import { join } from "path";

const scripts = (
  JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  ) as { scripts: Record<string, string> }
).scripts;

/** The env var `withThermalPrinterSimulatorFix` keys the `--exclude` on. */
const SIMULATOR_FLAG = "EXPO_SIMULATOR_BUILD=1";

describe("iOS build scripts", () => {
  it("offers a Simulator script that sets the printer-exclusion flag", () => {
    // Act
    const simulator = scripts["ios:simulator"];

    // Assert — without the flag, pod install relinks the device-only SDK.
    expect(simulator).toContain(SIMULATOR_FLAG);
    expect(simulator).toContain("expo run:ios");
  });

  it("leaves the device script unflagged, so real printing still links", () => {
    expect(scripts.ios).not.toContain(SIMULATOR_FLAG);
  });
});
