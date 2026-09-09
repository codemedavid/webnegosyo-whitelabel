/**
 * The QR pipeline: text segments go through printBill, QR segments are
 * rasterized (lib/receipt-qr) and sent through printImageBase64, and exactly
 * one cut happens — at the end of the receipt, never between segments (a cut
 * mid-receipt hands the customer their receipt in two pieces).
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { appOwnership: null }, // a real build, not Expo Go
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios", Version: 17, select: (map: Record<string, unknown>) => map.ios },
  PermissionsAndroid: { PERMISSIONS: {}, RESULTS: {}, requestMultiple: jest.fn(), request: jest.fn() },
}));

const mockBLEPrinter = {
  init: jest.fn(),
  getDeviceList: jest.fn(),
  connectPrinter: jest.fn(),
  closeConn: jest.fn(),
  printBill: jest.fn(),
  printImageBase64: jest.fn(),
};
const mockNetPrinter = {
  init: jest.fn(),
  connectPrinter: jest.fn(),
  closeConn: jest.fn(),
  printBill: jest.fn(),
  printImageBase64: jest.fn(),
};

jest.mock("@haroldtran/react-native-thermal-printer", () => ({
  BLEPrinter: mockBLEPrinter,
  NetPrinter: mockNetPrinter,
}));

jest.mock("../stores/printer-store", () => {
  const state = {
    printers: [
      // Image mode on purpose: this suite pins the RASTER path, which is now
      // the fallback for a head whose firmware cannot draw a QR itself. The
      // native path is pinned in printer-multi.test.ts.
      { id: "p1", type: "bluetooth", name: "T58", address: "AA:BB", roles: ["cashier"], qrMode: "image" },
    ] as unknown[],
    connectedAddress: "AA:BB" as string | null,
    isConnected: true,
    setConnectedAddress: jest.fn(),
  };
  return { usePrinterStore: { getState: () => state } };
});

import { printReceiptSegments } from "./printer";

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function run(promise: Promise<unknown>): Promise<unknown> {
  // printBill resolves via an optimistic timer; drain them all.
  const settled = promise.then((v) => v);
  await jest.runAllTimersAsync();
  return settled;
}

const QR_SEGMENTS = [
  { type: "text" as const, text: "KAPE CO\nTOTAL: P100.00" },
  { type: "qr" as const, data: "https://kape.example.com/kape/order/abc?t=beef" },
  { type: "text" as const, text: "Thank you!" },
];

describe("printReceiptSegments", () => {
  it("prints text via printBill and the QR via printImageBase64, in order", async () => {
    const calls: string[] = [];
    mockBLEPrinter.printBill.mockImplementation(() => calls.push("bill"));
    mockBLEPrinter.printImageBase64.mockImplementation(() => calls.push("image"));

    const result = (await run(printReceiptSegments(QR_SEGMENTS))) as { success: boolean };

    expect(result.success).toBe(true);
    expect(calls).toEqual(["bill", "image", "bill"]);
    const [base64] = mockBLEPrinter.printImageBase64.mock.calls[0]!;
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(100); // a real bitmap, not the URL
  });

  it("cuts only at the end — every earlier printBill call must not cut", async () => {
    await run(printReceiptSegments(QR_SEGMENTS));

    const billOpts = mockBLEPrinter.printBill.mock.calls.map((c) => c[1]);
    expect(billOpts.length).toBeGreaterThanOrEqual(2);
    for (const opts of billOpts.slice(0, -1)) {
      expect(opts.cut).toBe(false);
    }
    expect(billOpts[billOpts.length - 1]!.cut).toBe(true);
  });

  it("still cuts when the receipt ends on a QR segment", async () => {
    await run(printReceiptSegments(QR_SEGMENTS.slice(0, 2)));

    // A trailing feed print must carry the cut after the image.
    const billOpts = mockBLEPrinter.printBill.mock.calls.map((c) => c[1]);
    expect(billOpts[billOpts.length - 1]!.cut).toBe(true);
    const order = mockBLEPrinter.printImageBase64.mock.invocationCallOrder[0]!;
    const lastBill =
      mockBLEPrinter.printBill.mock.invocationCallOrder[
        mockBLEPrinter.printBill.mock.invocationCallOrder.length - 1
      ]!;
    expect(lastBill).toBeGreaterThan(order);
  });

  it("skips an unbuildable QR but still prints the text", async () => {
    const result = (await run(
      printReceiptSegments([
        { type: "text", text: "KAPE CO" },
        { type: "qr", data: "x".repeat(8000) }, // too long for any QR version
      ]),
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mockBLEPrinter.printImageBase64).not.toHaveBeenCalled();
    expect(mockBLEPrinter.printBill).toHaveBeenCalled();
  });

  it("behaves exactly like printReceipt for a single text segment", async () => {
    await run(printReceiptSegments([{ type: "text", text: "hello" }]));

    expect(mockBLEPrinter.printBill).toHaveBeenCalledTimes(1);
    expect(mockBLEPrinter.printBill.mock.calls[0]![1].cut).toBe(true);
    expect(mockBLEPrinter.printImageBase64).not.toHaveBeenCalled();
  });
});
