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

import { printToPrinter, printForRole, printReceiptSegments } from "./printer";
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
