/**
 * Guardrail for the class of crash that reads as a bug in `app/_layout.tsx`
 * but is not one:
 *
 *   Exception in HostFunction: TypeError: expected dynamic type 'boolean',
 *   but had type 'string'   (attributed to <Stack> in RootLayout)
 *
 * `react-native-screens` retyped the RNSScreen prop `fullScreenSwipeEnabled`
 * between 4.16 (`boolean`) and 4.24 (the string enum
 * 'undefined' | 'true' | 'false'). Screen.tsx now sends the string form, so a
 * JS bundle at 4.24 running against a native binary compiled from 4.16 throws
 * on the first Fabric commit of the screen stack. Expo Go for SDK 54 ships
 * 4.16 natively and cannot be changed, so this app simply cannot run there.
 *
 * Two things therefore have to stay true, and neither was observable before:
 *  - the JS pin must not drift from what the native project is built from
 *    (`npx expo install --check` actively advises the drift, and commit
 *    551c0459 records that the downgrade already happened once as WIP);
 *  - a developer who launches in Expo Go must be told that, in those words,
 *    instead of being handed the native TypeError.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import {
  EXPO_GO_REACT_NATIVE_SCREENS,
  PINNED_REACT_NATIVE_SCREENS,
  parsePodfileLockScreensVersion,
  screensRuntimeWarning,
  warnAboutScreensRuntime,
} from "./native-runtime-parity";

const appRoot = join(__dirname, "..");

describe("parsePodfileLockScreensVersion", () => {
  it("reads the RNScreens pod version out of a Podfile.lock", () => {
    // Arrange — the shape CocoaPods actually writes, subspec line included.
    const lock = [
      "  - RNReanimated (4.1.3):",
      "  - RNScreens (4.24.0):",
      "    - RNScreens/common (= 4.24.0)",
      "  - RNScreens/common (4.24.0):",
    ].join("\n");

    // Act
    const version = parsePodfileLockScreensVersion(lock);

    // Assert — the pod itself, not the subspec.
    expect(version).toBe("4.24.0");
  });

  it("returns null when the lockfile does not mention RNScreens", () => {
    expect(parsePodfileLockScreensVersion("  - RNReanimated (4.1.3):")).toBeNull();
  });
});

describe("react-native-screens pin", () => {
  it("is pinned exactly in package.json, so `expo install --fix` cannot widen it", () => {
    // Arrange
    const pkg = JSON.parse(
      readFileSync(join(appRoot, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };

    // Act
    const declared = pkg.dependencies["react-native-screens"];

    // Assert — an exact version, and the one the native side is built from.
    expect(declared).toBe(PINNED_REACT_NATIVE_SCREENS);
  });

  it("matches the version actually installed in node_modules", () => {
    const installed = JSON.parse(
      readFileSync(
        join(appRoot, "node_modules/react-native-screens/package.json"),
        "utf8",
      ),
    ) as { version: string };

    expect(installed.version).toBe(PINNED_REACT_NATIVE_SCREENS);
  });

  it("matches the RNScreens pod the iOS project is built from", () => {
    // `ios/` is prebuild output and gitignored, so it is only there on a
    // machine that has run a native build. Absent means nothing to compare —
    // the two assertions above still hold the pin down.
    const lockPath = join(appRoot, "ios/Podfile.lock");
    if (!existsSync(lockPath)) return;

    const podVersion = parsePodfileLockScreensVersion(
      readFileSync(lockPath, "utf8"),
    );

    expect(podVersion).toBe(PINNED_REACT_NATIVE_SCREENS);
  });

  it("is deliberately ahead of what Expo Go ships, which is why Expo Go is unusable", () => {
    expect(PINNED_REACT_NATIVE_SCREENS).not.toBe(EXPO_GO_REACT_NATIVE_SCREENS);
  });
});

describe("screensRuntimeWarning", () => {
  it("names Expo Go, the crash and the way out when launched in Expo Go", () => {
    // Arrange — Constants.appOwnership is "expo" only inside the Expo Go client.
    const facts = { appOwnership: "expo", isDev: true };

    // Act
    const warning = screensRuntimeWarning(facts);

    // Assert — actionable, not just "something is wrong".
    expect(warning).toContain("Expo Go");
    expect(warning).toContain("react-native-screens");
    expect(warning).toContain(PINNED_REACT_NATIVE_SCREENS);
    expect(warning).toContain(EXPO_GO_REACT_NATIVE_SCREENS);
    expect(warning).toContain("expo start --dev-client");
  });

  it("stays silent in a real development build", () => {
    expect(screensRuntimeWarning({ appOwnership: null, isDev: true })).toBeNull();
  });

  it("stays silent when appOwnership is unavailable", () => {
    expect(screensRuntimeWarning({ appOwnership: undefined, isDev: true })).toBeNull();
  });

  it("stays silent in production, where the check cannot help anyone", () => {
    expect(screensRuntimeWarning({ appOwnership: "expo", isDev: false })).toBeNull();
  });
});

describe("warnAboutScreensRuntime", () => {
  it("emits the warning through the given logger when running in Expo Go", () => {
    // Arrange
    const lines: string[] = [];

    // Act
    warnAboutScreensRuntime({ appOwnership: "expo", isDev: true }, (m) =>
      lines.push(m),
    );

    // Assert — the developer is told before the native TypeError lands.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("expo start --dev-client");
  });

  it("says nothing in a runtime that is not affected", () => {
    const lines: string[] = [];
    warnAboutScreensRuntime({ appOwnership: null, isDev: true }, (m) =>
      lines.push(m),
    );
    expect(lines).toEqual([]);
  });
});

describe("root layout wiring", () => {
  // The warning is worthless unless something actually runs it, and the only
  // place early enough to beat the first screen commit is the root layout.
  const layout = readFileSync(join(appRoot, "app/_layout.tsx"), "utf8");

  it("imports the parity check into app/_layout.tsx", () => {
    expect(layout).toContain("native-runtime-parity");
  });

  it("runs the parity check at module scope, before any screen renders", () => {
    expect(layout).toMatch(/^warnAboutScreensRuntime\(/m);
  });
});
