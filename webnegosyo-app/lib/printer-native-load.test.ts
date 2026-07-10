/**
 * Regression test for the iOS "`new NativeEventEmitter()` requires a non-null
 * argument" crash.
 *
 * @haroldtran/react-native-thermal-printer builds a module-level
 * NativeEventEmitter for the network printer at `require()` time. On iOS it did
 * this unconditionally, so when the RNNetPrinter native module is absent (iOS
 * simulator, or a build where the module failed to register) the constructor
 * threw during module evaluation — escaping the try/catch in `lib/printer.ts`
 * and crashing the Printer Settings screen with a red box.
 *
 * These tests load the real library with the native modules mocked as absent,
 * reproducing the simulator environment. Before the patch, requiring the
 * library throws (RED). After the patch, it loads and exposes an undefined
 * emitter instead of crashing (GREEN).
 */

// Mock react-native so NativeEventEmitter enforces the same non-null invariant
// as the real iOS implementation, and no native printer modules are present.
jest.mock(
  "react-native",
  () => {
    class NativeEventEmitter {
      constructor(nativeModule?: unknown) {
        if (nativeModule === null || nativeModule === undefined) {
          throw new Error(
            "`new NativeEventEmitter()` requires a non-null argument."
          );
        }
      }
      addListener() {
        return { remove() {} };
      }
      removeAllListeners() {}
      removeSubscription() {}
    }

    return {
      NativeEventEmitter,
      NativeModules: {}, // RNBLEPrinter / RNNetPrinter absent, as on the simulator
      Platform: { OS: "ios", select: (map: Record<string, unknown>) => map.ios },
    };
  },
  { virtual: true }
);

// net-connect imports react-native-ping at module scope but only calls it inside
// functions, so a stub keeps module evaluation from failing.
jest.mock("react-native-ping", () => ({ default: {} }), { virtual: true });

const LIBRARY = "@haroldtran/react-native-thermal-printer";

describe("thermal printer library — module load with native modules absent (iOS)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("does not throw when RNNetPrinter is absent on iOS", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require(LIBRARY)).not.toThrow();
  });

  it("exposes an undefined NetPrinterEventEmitter instead of crashing", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require(LIBRARY);
    expect(lib.NetPrinterEventEmitter).toBeUndefined();
  });

  it("still exports the printer instances so callers can feature-detect", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require(LIBRARY);
    expect(lib.BLEPrinter).toBeDefined();
    expect(lib.NetPrinter).toBeDefined();
  });
});
