/**
 * Regression test for network printers never connecting.
 *
 * The library's NetPrinter.connectPrinter preflights the host with
 * react-native-ping. That package is a NESTED dependency of the printer
 * library, so it is never autolinked into the app binary — its native module
 * does not exist at runtime and Ping.start throws. The preflight therefore
 * rejects every connection attempt before the actual native connectPrinter is
 * even called.
 *
 * RED before the patch (connect rejects when ping is unavailable), GREEN after
 * (the ping preflight is gone and the native connect decides the outcome).
 */

jest.mock(
  "react-native",
  () => {
    class NativeEventEmitter {
      addListener() {
        return { remove() {} };
      }
      removeAllListeners() {}
    }
    return {
      NativeEventEmitter,
      NativeModules: {
        RNBLEPrinter: {},
        RNNetPrinter: {
          connectPrinter: jest.fn(
            (
              host: string,
              port: number,
              success: (printer: unknown) => void,
              _fail: (error: Error) => void
            ) => success({ host, port })
          ),
        },
        RNUSBPrinter: {},
      },
      Platform: { OS: "ios", select: (map: Record<string, unknown>) => map.ios },
    };
  },
  { virtual: true }
);

// Simulate the real runtime: react-native-ping's native module is absent
// (nested dependency, never autolinked), so any call into it throws.
jest.mock(
  "react-native-ping",
  () => ({
    default: {
      start: () => {
        throw new TypeError("Cannot read property 'start' of null");
      },
    },
  }),
  { virtual: true }
);

const LIBRARY = "@haroldtran/react-native-thermal-printer";

describe("NetPrinter.connectPrinter — must not depend on react-native-ping", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("connects via the native module even when ping is unavailable", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require(LIBRARY);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require("react-native");

    await expect(lib.NetPrinter.connectPrinter("192.168.1.50", 9100)).resolves.toBeTruthy();
    expect(NativeModules.RNNetPrinter.connectPrinter).toHaveBeenCalledWith(
      "192.168.1.50",
      9100,
      expect.any(Function),
      expect.any(Function)
    );
  });
});
