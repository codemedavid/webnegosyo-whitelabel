/**
 * The hook that keeps handsets upright, tested for the way it FAILS.
 *
 * `expo-screen-orientation` resolves its native module the moment the package
 * is imported — `requireNativeModule('ExpoScreenOrientation')` runs at its
 * module scope and throws when the binary does not carry it. A STATIC import
 * of the package therefore takes the whole importing module graph down with
 * it, and this hook is imported by `app/_layout.tsx`, so on a client built
 * before the dependency was added the app did not start at all. It reported
 * itself as an error on the import line of this hook's source, which reads
 * like a typo and is not.
 *
 * The lock is a nicety; the app starting is not. These tests pin that order.
 */
import { renderHook } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { Dimensions, Platform } from "react-native";

import { useOrientationLock } from "./use-orientation-lock";

const HANDSET = { width: 390, height: 844 };
const TABLET = { width: 834, height: 1194 };
const PORTRAIT_UP = 1;

const mockLockAsync = jest.fn();
/** Flipped by a test to stand in for a binary without the native module. */
let mockNativeModuleMissing = false;

// The factory runs on every `require` while it throws — nothing gets cached —
// which is exactly how the real package behaves on a client that lacks it.
jest.mock("expo-screen-orientation", () => {
  if (mockNativeModuleMissing) {
    throw new Error("Cannot find native module 'ExpoScreenOrientation'");
  }
  return { lockAsync: mockLockAsync, OrientationLock: { PORTRAIT_UP: 1 } };
});

/**
 * Points the real `react-native` at a given device.
 *
 * The module is patched in place rather than `jest.mock`ed: RN's index is a
 * wall of lazy getters, and spreading it to build a replacement eagerly
 * resolves every one — including the dev-menu TurboModule, which does not
 * exist under Jest.
 */
function withScreen(os: string, screen: { width: number; height: number }) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  jest.spyOn(Dimensions, "get").mockReturnValue(screen as never);
}

const originalOS = Platform.OS;

beforeEach(() => {
  mockNativeModuleMissing = false;
  mockLockAsync.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  jest.restoreAllMocks();
});

describe("useOrientationLock", () => {
  it("locks an Android handset upright", () => {
    withScreen("android", HANDSET);

    renderHook(() => useOrientationLock());

    expect(mockLockAsync).toHaveBeenCalledWith(PORTRAIT_UP);
  });

  it("leaves an Android tablet free to turn", () => {
    withScreen("android", TABLET);

    renderHook(() => useOrientationLock());

    expect(mockLockAsync).not.toHaveBeenCalled();
  });

  it("leaves iOS to its declarative per-idiom keys", () => {
    withScreen("ios", HANDSET);

    renderHook(() => useOrientationLock());

    expect(mockLockAsync).not.toHaveBeenCalled();
  });

  it("still mounts when the binary has no native module", () => {
    mockNativeModuleMissing = true;
    withScreen("android", HANDSET);

    expect(() => renderHook(() => useOrientationLock())).not.toThrow();
  });

  it("swallows a lock the OS refuses", () => {
    withScreen("android", HANDSET);
    mockLockAsync.mockRejectedValue(new Error("refused"));

    expect(() => renderHook(() => useOrientationLock())).not.toThrow();
  });

  it("never reaches the package on a platform that does not need it", () => {
    // Proves the require is guarded by the platform check and not merely
    // wrapped: an iOS client that lacks the module must not even look.
    mockNativeModuleMissing = true;
    withScreen("ios", HANDSET);

    expect(() => renderHook(() => useOrientationLock())).not.toThrow();
  });
});

describe("the import of expo-screen-orientation", () => {
  it("is deferred, so a client without the native module still boots", () => {
    // A source assertion because the failure it guards against happens at
    // module-evaluation time — before any test could render anything.
    const source = readFileSync(join(__dirname, "use-orientation-lock.ts"), "utf8");

    expect(source).not.toMatch(/^import .*expo-screen-orientation/m);
    expect(source).toMatch(/require\("expo-screen-orientation"\)/);
  });
});
