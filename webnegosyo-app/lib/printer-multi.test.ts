/**
 * Multi-printer printing. The native lib holds ONE active connection, so
 * printing to several printers means connect-per-job through a serialized
 * queue:
 *
 *  - a job for the already-connected printer skips the reconnect (the
 *    single-printer fast path must survive);
 *  - concurrent print calls never interleave — a receipt and a chit racing
 *    each other on one device would garble both;
 *  - one dead printer is isolated: the kitchen printer being off can never
 *    block the cashier's receipt, and a kitchen fan-out reports per-printer
 *    results instead of throwing.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { appOwnership: null }, // a real build, not Expo Go
}));

jest.mock("react-native", () => ({
  Platform: { OS: "android", Version: 33, select: (map: Record<string, unknown>) => map.android },
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

interface MockState {
  printers: unknown[];
  connectedAddress: string | null;
  isConnected: boolean;
  setConnectedAddress: (address: string | null) => void;
}

const mockState: MockState = {
  printers: [],
  connectedAddress: null,
  isConnected: false,
  setConnectedAddress: (address: string | null) => {
    mockState.connectedAddress = address;
    mockState.isConnected = address !== null;
  },
};

jest.mock("../stores/printer-store", () => ({
  usePrinterStore: { getState: () => mockState },
}));

import {
  printToPrinter,
  printForRole,
  printReceiptSegments,
  warmUpPrinter,
  pickWarmUpTarget,
} from "./printer";
import type { RegisteredPrinter } from "./printer-registry";

const CASHIER: RegisteredPrinter = {
  id: "cash",
  type: "bluetooth",
  name: "Front",
  address: "AA:BB",
  roles: ["cashier"],
};
const KITCHEN_1: RegisteredPrinter = {
  id: "kit1",
  type: "bluetooth",
  name: "Hot line",
  address: "CC:DD",
  roles: ["kitchen"],
};
const KITCHEN_2: RegisteredPrinter = {
  id: "kit2",
  type: "network",
  name: "Expo",
  address: "10.0.0.5:9100",
  roles: ["kitchen"],
};

const SEGMENTS = [{ type: "text" as const, text: "hello" }];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockState.printers = [CASHIER, KITCHEN_1, KITCHEN_2];
  mockState.connectedAddress = null;
  mockState.isConnected = false;
  mockBLEPrinter.init.mockResolvedValue(undefined);
  mockBLEPrinter.connectPrinter.mockResolvedValue({ device_name: "ok" });
  mockNetPrinter.init.mockResolvedValue(undefined);
  mockNetPrinter.connectPrinter.mockResolvedValue({ device_name: "ok" });
});

afterEach(() => {
  jest.useRealTimers();
});

async function run<T>(promise: Promise<T>): Promise<T> {
  // printBill resolves via an optimistic timer; drain them all.
  const settled = promise.then((v) => v);
  await jest.runAllTimersAsync();
  return settled;
}

describe("printToPrinter", () => {
  it("connects to the target before printing when nothing is connected", async () => {
    const result = await run(printToPrinter(CASHIER, SEGMENTS));

    expect(result.success).toBe(true);
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledWith("AA:BB");
    expect(mockBLEPrinter.printBill).toHaveBeenCalledTimes(1);
    expect(mockState.connectedAddress).toBe("AA:BB");
  });

  it("skips the reconnect when the target is already the connected printer", async () => {
    mockState.connectedAddress = "AA:BB";
    mockState.isConnected = true;

    const result = await run(printToPrinter(CASHIER, SEGMENTS));

    expect(result.success).toBe(true);
    expect(mockBLEPrinter.connectPrinter).not.toHaveBeenCalled();
  });

  it("switches the connection when a different printer is the target", async () => {
    mockState.connectedAddress = "AA:BB";
    mockState.isConnected = true;

    const result = await run(printToPrinter(KITCHEN_1, SEGMENTS));

    expect(result.success).toBe(true);
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledWith("CC:DD");
    expect(mockState.connectedAddress).toBe("CC:DD");
  });

  it("serializes concurrent jobs — the second never starts before the first finishes", async () => {
    const events: string[] = [];
    mockBLEPrinter.connectPrinter.mockImplementation(async (address: string) => {
      events.push(`connect:${address}`);
      return { device_name: "ok" };
    });
    mockBLEPrinter.printBill.mockImplementation(() => events.push("print:ble"));
    mockNetPrinter.connectPrinter.mockImplementation(async () => {
      events.push("connect:net");
      return { device_name: "ok" };
    });
    mockNetPrinter.printBill.mockImplementation(() => events.push("print:net"));

    const first = printToPrinter(KITCHEN_1, SEGMENTS);
    const second = printToPrinter(KITCHEN_2, SEGMENTS);
    await jest.runAllTimersAsync();
    await first;
    await second;

    expect(events).toEqual(["connect:CC:DD", "print:ble", "connect:net", "print:net"]);
  });
});

describe("printForRole", () => {
  it("fans a kitchen chit out to EVERY kitchen-role printer", async () => {
    const outcome = await run(printForRole("kitchen", SEGMENTS));

    expect(outcome.anySuccess).toBe(true);
    expect(outcome.results.map((r) => r.printerId)).toEqual(["kit1", "kit2"]);
    expect(mockBLEPrinter.printBill).toHaveBeenCalledTimes(1);
    expect(mockNetPrinter.printBill).toHaveBeenCalledTimes(1);
  });

  it("prints the cashier receipt on the first cashier printer only", async () => {
    const outcome = await run(printForRole("cashier", SEGMENTS));

    expect(outcome.results.map((r) => r.printerId)).toEqual(["cash"]);
  });

  it("isolates a dead printer — the other kitchen printer still prints", async () => {
    mockBLEPrinter.connectPrinter.mockRejectedValue(new Error("printer off"));
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);

    const outcome = await run(printForRole("kitchen", SEGMENTS));

    expect(outcome.anySuccess).toBe(true);
    const byId = new Map(outcome.results.map((r) => [r.printerId, r.result.success]));
    expect(byId.get("kit1")).toBe(false);
    expect(byId.get("kit2")).toBe(true);
  });

  it("reports failure without throwing when no printer holds the role", async () => {
    mockState.printers = [CASHIER];

    const outcome = await run(printForRole("kitchen", SEGMENTS));

    expect(outcome.anySuccess).toBe(false);
    expect(outcome.results).toEqual([]);
  });
});

describe("printReceiptSegments compat", () => {
  it("routes legacy calls to the first cashier-role printer", async () => {
    const result = await run(printReceiptSegments(SEGMENTS));

    expect(result.success).toBe(true);
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledWith("AA:BB");
  });

  it("falls back to the first saved printer when none holds the cashier role", async () => {
    mockState.printers = [KITCHEN_2];

    const result = await run(printReceiptSegments(SEGMENTS));

    expect(result.success).toBe(true);
    expect(mockNetPrinter.printBill).toHaveBeenCalledTimes(1);
  });

  it("still reports the no-printer case as a structured failure", async () => {
    mockState.printers = [];

    const result = await run(printReceiptSegments(SEGMENTS));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no printer/i);
  });
});

describe("what reaches the head", () => {
  const QR_SEGMENTS = [
    { type: "text" as const, text: "<C><B>Scan</B></C>" },
    { type: "qr" as const, data: "https://www.webnegosyo.com/x/order/1?t=abc" },
  ];

  // Image mode: these two pin the RASTER fallback's width handling.
  it("tells the driver the paper is 58mm by default, so the QR raster is not padded to 80mm", async () => {
    await run(printToPrinter({ ...CASHIER, qrMode: "image" }, QR_SEGMENTS));

    expect(mockBLEPrinter.printImageBase64).toHaveBeenCalledTimes(1);
    const [, options] = mockBLEPrinter.printImageBase64.mock.calls[0]!;
    expect(options.printerWidthType).toBe("58");
    expect(options.imageWidth).toBeLessThanOrEqual(384);
  });

  it("names 80mm paper when the printer is saved as such", async () => {
    await run(printToPrinter({ ...CASHIER, paperWidth: 80, qrMode: "image" }, QR_SEGMENTS));

    const [, options] = mockBLEPrinter.printImageBase64.mock.calls[0]!;
    expect(options.printerWidthType).toBe("80");
  });

  it("hands the driver control bytes, never the layout's markup tags", async () => {
    await run(printToPrinter(CASHIER, QR_SEGMENTS));

    const [text] = mockBLEPrinter.printBill.mock.calls[0]!;
    expect(text).not.toMatch(/<\/?[CB]>/);
    expect(text.startsWith("\x1Ba\x00")).toBe(true);
    expect(text).toContain("\x1Ba\x01");
    expect(text).toContain("\x1BE\x01Scan");
  });
});

describe("the tracking QR on paper", () => {
  const SHORT_URL =
    "https://www.webnegosyo.com/seacook/order/jh77d616dta0dzva90pfwm5ypd8dxt7h?t=1266c59676e67244a3a8";
  const LONG_URL = SHORT_URL + "f28569b7ac754b2d9e7981242ed1150ec4927af23a42";
  const RECEIPT = (url: string) => [
    { type: "text" as const, text: "<C><B>Scan to track your order</B></C>" },
    { type: "qr" as const, data: url },
    { type: "text" as const, text: "<C>Thank you!</C>" },
  ];

  it("is drawn by the printer from ONE text call — no raster, no pause between pieces", async () => {
    await run(printToPrinter(CASHIER, RECEIPT(SHORT_URL)));

    expect(mockBLEPrinter.printImageBase64).not.toHaveBeenCalled();
    expect(mockBLEPrinter.printBill).toHaveBeenCalledTimes(1);
    const [text, options] = mockBLEPrinter.printBill.mock.calls[0]!;
    expect(text).toContain("Scan to track your order");
    expect(text).toContain(`\x1D(k`);
    expect(text).toContain(SHORT_URL);
    expect(text).toContain("Thank you!");
    expect(options.cut).toBe(true);
  });

  it("falls back to the raster when the printer is set to image mode", async () => {
    await run(printToPrinter({ ...CASHIER, qrMode: "image" }, RECEIPT(SHORT_URL)));

    expect(mockBLEPrinter.printImageBase64).toHaveBeenCalledTimes(1);
    expect(mockBLEPrinter.printBill).toHaveBeenCalledTimes(2);
    // The caption before the QR must not feed paper; only the final piece cuts.
    const [, before] = mockBLEPrinter.printBill.mock.calls[0]!;
    const [, after] = mockBLEPrinter.printBill.mock.calls[1]!;
    expect(before.cut).toBe(false);
    expect(before.tailingLine).toBe(false);
    expect(after.cut).toBe(true);
  });

  it("falls back to the raster for a URL too long for one clean command", async () => {
    await run(printToPrinter(CASHIER, RECEIPT(LONG_URL)));

    expect(mockBLEPrinter.printImageBase64).toHaveBeenCalledTimes(1);
    const [, options] = mockBLEPrinter.printImageBase64.mock.calls[0]!;
    // 4 dots per module keeps a 49-module code under 30mm on a 58mm head.
    expect(options.imageWidth).toBeLessThanOrEqual(232);
  });
});

describe("connect-while-building", () => {
  it("opens the connection BEFORE the receipt has finished building", async () => {
    const events: string[] = [];
    mockBLEPrinter.connectPrinter.mockImplementation(async () => {
      events.push("connect");
    });
    mockBLEPrinter.printBill.mockImplementation(() => events.push("print"));
    let release: (segments: typeof SEGMENTS) => void = () => {};
    const building = new Promise<typeof SEGMENTS>((resolve) => {
      release = resolve;
    });

    const pending = printToPrinter(CASHIER, building);
    await jest.advanceTimersByTimeAsync(0);
    expect(events).toEqual(["connect"]);

    release(SEGMENTS);
    const result = await run(pending);
    expect(result.success).toBe(true);
    expect(events).toEqual(["connect", "print"]);
  });

  it("swallows a receipt that fails to build AFTER the connection failed — no unhandled rejection", async () => {
    mockBLEPrinter.connectPrinter.mockRejectedValue(new Error("printer off"));
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    let fail: (err: Error) => void = () => {};
    const building = new Promise<typeof SEGMENTS>((_, reject) => {
      fail = reject;
    });
    const result = await run(printToPrinter(CASHIER, building));
    expect(result.success).toBe(false);
    fail(new Error("layout gone"));
    // Fake timers own setImmediate; a few microtask turns are all a rejection needs to surface.
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("reports a receipt that could not be built without touching the printer", async () => {
    const result = await run(printToPrinter(CASHIER, Promise.reject(new Error("no layout"))));
    expect(result).toEqual({ success: false, error: "no layout" });
    expect(mockBLEPrinter.printBill).not.toHaveBeenCalled();
  });
});

describe("warmUpPrinter", () => {
  it("connects without printing so the first receipt skips the handshake", async () => {
    const result = await run(warmUpPrinter(CASHIER));
    expect(result.success).toBe(true);
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledWith("AA:BB");
    expect(mockBLEPrinter.printBill).not.toHaveBeenCalled();
    expect(mockState.connectedAddress).toBe("AA:BB");

    await run(printToPrinter(CASHIER, SEGMENTS));
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when that printer is already the live connection", async () => {
    mockState.connectedAddress = "AA:BB";
    await run(warmUpPrinter(CASHIER));
    expect(mockBLEPrinter.connectPrinter).not.toHaveBeenCalled();
  });

  it("fails quietly when the printer is off — a warm-up never throws", async () => {
    mockBLEPrinter.connectPrinter.mockRejectedValue(new Error("printer off"));
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);
    const result = await run(warmUpPrinter(CASHIER));
    expect(result.success).toBe(false);
  });

  it("targets the cashier printer, falling back to the first saved one", () => {
    expect(pickWarmUpTarget([KITCHEN_1, CASHIER])?.id).toBe("cash");
    expect(pickWarmUpTarget([KITCHEN_1, KITCHEN_2])?.id).toBe("kit1");
    expect(pickWarmUpTarget([])).toBeUndefined();
  });
});
