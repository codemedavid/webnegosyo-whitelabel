/**
 * Regression test for iOS Bluetooth printing producing no output (iPad/iPhone).
 *
 * The native iOS module (RNBLEPrinter.m printRawData:) base64-decodes its text
 * argument with `initWithBase64EncodedString:options:0` before printing. The
 * library's JS layer, however, sends the receipt as PLAIN TEXT on iOS
 * (textPreprocessingIOS), so the native decode returns nil and nothing is
 * printed — connect succeeds, cut fires, but the paper comes out blank.
 * Android is unaffected because its JS path base64-encodes (billTo64Buffer).
 *
 * These tests load the real library with react-native mocked as iOS and assert
 * that what reaches RNBLEPrinter.printRawData survives the native module's
 * base64 round-trip. RED before the patch (plain text is not valid base64),
 * GREEN after (JS base64-encodes to match the native decode).
 */

import { Buffer } from "buffer";

jest.mock(
  "react-native",
  () => {
    const printRawData = jest.fn();
    class NativeEventEmitter {
      addListener() {
        return { remove() {} };
      }
      removeAllListeners() {}
    }
    return {
      NativeEventEmitter,
      NativeModules: {
        RNBLEPrinter: { printRawData },
        RNNetPrinter: { printRawData: jest.fn() },
        RNUSBPrinter: {},
      },
      Platform: { OS: "ios", select: (map: Record<string, unknown>) => map.ios },
    };
  },
  { virtual: true }
);

// net-connect imports react-native-ping at module scope; stub so module
// evaluation cannot fail regardless of the nested native module's absence.
jest.mock("react-native-ping", () => ({ default: {} }), { virtual: true });

const LIBRARY = "@haroldtran/react-native-thermal-printer";

/**
 * Mirror of the native decode: NSData initWithBase64EncodedString with
 * options:0 returns nil unless the string is strictly valid base64. Node's
 * Buffer.from(base64) is lenient, so validate strictly first.
 */
function decodeAsNativeWould(sent: string): string | null {
  const strict = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!strict.test(sent) || sent.length % 4 !== 0) return null;
  return Buffer.from(sent, "base64").toString("utf8");
}

describe("iOS BLE printing — text must survive the native base64 decode", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("printBill sends text the native module can base64-decode back to the receipt", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require(LIBRARY);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require("react-native");

    const receipt = "WEBNEGOSYO STORE\nOrder #42\n1x Burger  120.00\nTOTAL  120.00\n";
    lib.BLEPrinter.printBill(receipt, { beep: false, cut: true, tailingLine: true });

    expect(NativeModules.RNBLEPrinter.printRawData).toHaveBeenCalledTimes(1);
    const sent = NativeModules.RNBLEPrinter.printRawData.mock.calls[0][0] as string;
    expect(decodeAsNativeWould(sent)).toBe(receipt);
  });

  it("printText sends text the native module can base64-decode back to the text", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require(LIBRARY);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require("react-native");

    const text = "PRINTER TEST PAGE\nHello iPad\n";
    lib.BLEPrinter.printText(text, {});

    expect(NativeModules.RNBLEPrinter.printRawData).toHaveBeenCalledTimes(1);
    const sent = NativeModules.RNBLEPrinter.printRawData.mock.calls[0][0] as string;
    expect(decodeAsNativeWould(sent)).toBe(text);
  });
});
