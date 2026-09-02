/**
 * Turns one specific, badly-disguised crash into a sentence a developer can act
 * on.
 *
 * `react-native-screens` retyped the `RNSScreen` prop `fullScreenSwipeEnabled`
 * between 4.16 (a plain `boolean`) and 4.24 (the string enum
 * 'undefined' | 'true' | 'false'). Screen.tsx sends the string form from 4.17
 * onwards, so a JS bundle at 4.24 driving a native binary compiled from 4.16
 * throws on the first Fabric commit of the screen stack:
 *
 *   Exception in HostFunction: TypeError: expected dynamic type 'boolean',
 *   but had type 'string'
 *
 * React attributes that to the nearest owning component — `<Stack>` in
 * `app/_layout.tsx` — so it reads as a routing bug and is not one. Expo Go for
 * SDK 54 ships 4.16 natively and cannot be changed, which makes Expo Go simply
 * unusable for this app.
 *
 * Nothing here runs in production: the warning is dev-only, and the pin
 * constants exist so a test can hold package.json, node_modules and the iOS
 * Podfile.lock to the same number.
 */

/**
 * The exact `react-native-screens` this app is built against.
 *
 * Pinned (not ranged) on purpose — see commit 551c0459, which took it to 4.24.0
 * for the iPadOS 26 navigation fixes. `npx expo install --check` will keep
 * advising a downgrade to the SDK's ~4.16.0; that advice is wrong here and has
 * already been applied once by accident. Changing this number means rebuilding
 * every native client, so change it together with a new dev/EAS build.
 */
export const PINNED_REACT_NATIVE_SCREENS = "4.24.0";

/**
 * What the Expo Go client for this SDK carries natively, from
 * `expo/bundledNativeModules.json`. Kept as a constant purely so the mismatch
 * can be named in the warning below.
 */
export const EXPO_GO_REACT_NATIVE_SCREENS = "4.16.0";

/**
 * The pod line CocoaPods writes for the root pod, e.g. `- RNScreens (4.24.0):`.
 * The trailing space before `(` is what keeps the `RNScreens/common` subspec
 * line, which carries the same version, from matching first.
 */
const POD_VERSION = /^\s*-\s+RNScreens\s+\(([^)]+)\)/m;

/** Extracts the RNScreens pod version from a Podfile.lock, or null if absent. */
export function parsePodfileLockScreensVersion(lock: string): string | null {
  return POD_VERSION.exec(lock)?.[1] ?? null;
}

export interface RuntimeFacts {
  /** `Constants.appOwnership` — "expo" only inside the Expo Go client. */
  appOwnership: string | null | undefined;
  /** `__DEV__`. Production builds get no warning; it could not help there. */
  isDev: boolean;
}

/**
 * The message to show before the native TypeError does, or null when the
 * runtime is fine.
 */
export function screensRuntimeWarning({
  appOwnership,
  isDev,
}: RuntimeFacts): string | null {
  if (!isDev) return null;
  if (appOwnership !== "expo") return null;

  return [
    "This app cannot run in Expo Go.",
    `It pins react-native-screens ${PINNED_REACT_NATIVE_SCREENS}, but Expo Go ships ${EXPO_GO_REACT_NATIVE_SCREENS} natively.`,
    "The mismatch crashes on the first screen with:",
    "  TypeError: expected dynamic type 'boolean', but had type 'string'",
    "which React blames on <Stack> in app/_layout.tsx. That file is fine.",
    "Use the development build instead:",
    "  npx expo run:ios          (or run:android)",
    "  npx expo start --dev-client   if it is already installed",
    "Do not 'fix' this by downgrading react-native-screens — the pin is deliberate.",
  ].join("\n");
}

/** Where the warning goes. Injected so a test can observe it. */
export type WarningLogger = (message: string) => void;

/**
 * Emits {@link screensRuntimeWarning}, if there is one, through `log`.
 *
 * Call this at module scope in the root layout: the native TypeError is thrown
 * on the first screen commit, so anything running inside a component is
 * already too late to be read first.
 */
export function warnAboutScreensRuntime(
  facts: RuntimeFacts,
  log: WarningLogger,
): void {
  const warning = screensRuntimeWarning(facts);
  if (warning) log(warning);
}
