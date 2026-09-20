import { useEffect } from "react";
import { Dimensions, Platform } from "react-native";

import { orientationLockFor } from "./screen-size";

/**
 * The slice of `expo-screen-orientation` this hook uses.
 *
 * Declared locally because the package is never statically imported — see
 * {@link loadScreenOrientation} — so there is no type to import either.
 */
interface ScreenOrientationModule {
  lockAsync: (lock: number) => Promise<void>;
  OrientationLock: { PORTRAIT_UP: number };
}

/**
 * Fetches `expo-screen-orientation`, or null on a client that cannot offer it.
 *
 * The package resolves its native counterpart at MODULE scope —
 * `requireNativeModule('ExpoScreenOrientation')` runs on the first line of its
 * entry point and throws when the binary does not carry it. A static `import`
 * would therefore propagate that throw to everything upstream, and this hook
 * is imported by `app/_layout.tsx`: a merchant running a client built before
 * the dependency was added got no app at all, blamed on the import line here.
 *
 * Native modules arrive only in a new build, never in an OTA update, so the
 * two versions coexist in the field by design for as long as it takes every
 * merchant to update. Deferring the require is what lets the older binary keep
 * working — without the lock, which is the part that is allowed to be missing.
 */
function loadScreenOrientation(): ScreenOrientationModule | null {
  try {
    // Guarded require for an optional native module, as in `printer.ts` — the
    // whole point is to reach the package in a way that can fail locally.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-screen-orientation") as ScreenOrientationModule;
  } catch {
    return null;
  }
}

/**
 * Keeps handsets upright while letting tablets turn.
 *
 * iOS decides this declaratively — `app.config.ts` ships per-idiom
 * `UISupportedInterfaceOrientations` keys — so this only has work to do on
 * Android, whose manifest has no way to vary orientation by screen size. There
 * the activity is left unlocked and the decision is made here instead.
 *
 * Read once at startup from `Dimensions.get("screen")`, not subscribed: the
 * question is what KIND of device this is, and that does not change while the
 * app is running. Subscribing to the window would also feed rotation back into
 * the lock that permitted it.
 *
 * Failures are swallowed on purpose, an absent module included. A register
 * that can rotate is untidy, never broken, and is not worth an alert in front
 * of a customer.
 */
export function useOrientationLock(): void {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (orientationLockFor(Dimensions.get("screen")) !== "portrait") return;

    const screenOrientation = loadScreenOrientation();
    if (!screenOrientation) return;

    screenOrientation
      .lockAsync(screenOrientation.OrientationLock.PORTRAIT_UP)
      .catch(() => {});
  }, []);
}
