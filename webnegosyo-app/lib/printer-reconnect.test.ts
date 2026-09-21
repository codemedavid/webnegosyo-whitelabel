/**
 * The printer list offered "Test" on every saved printer, whether or not
 * anything had ever reached it. On a printer that was off, asleep or out of
 * range that tap ran the whole connect → write → "Broken pipe" path and came
 * back as a modal error the cashier could do nothing about — and the row went
 * on offering Test, so the next tap did it again.
 *
 * The fix is that every path which touches a head records what happened, and
 * the row reads that record. This suite pins the record:
 *
 *   - a connection that comes up marks the printer ready (Test is offered)
 *   - a connection that fails marks it unreachable, in merchant words
 *   - a print that fails twice marks it unreachable, not ready
 *   - "Reconnect" closes the dead socket before dialling, or it is a no-op
 *   - "Scan for it" separates "gone" from "here but dropped"
 */

const platform = { OS: "android", Version: 33, select: (map: Record<string, unknown>) => map.android };

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { appOwnership: null }, // a real build, not Expo Go
}));

jest.mock("react-native", () => ({
  Platform: platform,
  PermissionsAndroid: {
    PERMISSIONS: { BLUETOOTH_SCAN: "scan", BLUETOOTH_CONNECT: "connect" },
    RESULTS: { GRANTED: "granted" },
    requestMultiple: jest.fn(),
    request: jest.fn(),
  },
}));

const mockBLEPrinter = {
  init: jest.fn(),
  getDeviceList: jest.fn(),
  connectPrinter: jest.fn(),
  closeConn: jest.fn(),
  printBill: jest.fn(),
  printImageBase64: jest.fn(),
};
const mockNetPrinter = { ...mockBLEPrinter };

jest.mock("@haroldtran/react-native-thermal-printer", () => ({
  BLEPrinter: mockBLEPrinter,
  NetPrinter: mockNetPrinter,
}));

interface MockHealth {
  status: PrinterStatus;
  message?: string;
}

const mockState = {
  printers: [] as unknown[],
  connectedAddress: null as string | null,
  isConnected: false,
  setConnectedAddress: (address: string | null) => {
    mockState.connectedAddress = address;
    mockState.isConnected = address !== null;
  },
  health: {} as Record<string, MockHealth>,
  setPrinterHealth: (address: string, status: PrinterStatus, message?: string) => {
    mockState.health[address] = message ? { status, message } : { status };
  },
};

jest.mock("../stores/printer-store", () => ({
  usePrinterStore: { getState: () => mockState },
}));

import { findSavedPrinter, printToPrinter, reconnectPrinter } from "./printer";
import { shouldTestPrint, type PrinterStatus } from "./printer-health";
import type { RegisteredPrinter } from "./printer-registry";

const PRINTER: RegisteredPrinter = {
  id: "cash",
  type: "bluetooth",
  name: "Front",
  address: "AA:BB",
  roles: ["cashier"],
};

const SEGMENTS = [{ type: "text" as const, text: "hello" }];
const BROKEN_PIPE = "failed to print data: Broken pipe";

/** Make the next printBill call report a failure through its onError callback. */
function failPrintWith(message: string): void {
  mockBLEPrinter.printBill.mockImplementationOnce(
    (_text: string, opts: { onError?: (err: Error) => void }) => {
      opts?.onError?.(new Error(message));
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockState.printers = [PRINTER];
  mockState.connectedAddress = null;
  mockState.isConnected = false;
  mockState.health = {};
  mockBLEPrinter.init.mockResolvedValue(undefined);
  mockBLEPrinter.connectPrinter.mockResolvedValue({ device_name: "ok" });
  mockBLEPrinter.closeConn.mockResolvedValue(undefined);
  mockBLEPrinter.getDeviceList.mockResolvedValue([
    { device_name: "Front", inner_mac_address: "AA:BB" },
  ]);
  mockBLEPrinter.printBill.mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then((v) => v);
  await jest.runAllTimersAsync();
  return settled;
}

describe("a printer's row only offers Test once something has reached it", () => {
  it("starts with nothing recorded, so the row asks for a connection first", () => {
    // Arrange — a fresh launch: the store knows the printer, nothing more.
    const status = mockState.health[PRINTER.address]?.status ?? "unknown";

    // Assert
    expect(shouldTestPrint(status)).toBe(false);
  });

  it("marks the printer ready once a print lands", async () => {
    // Act
    const result = await run(printToPrinter(PRINTER, SEGMENTS));

    // Assert
    expect(result.success).toBe(true);
    expect(mockState.health[PRINTER.address]?.status).toBe("ready");
    expect(shouldTestPrint(mockState.health[PRINTER.address]!.status)).toBe(true);
  });

  it("marks the printer unreachable when the write fails on both attempts", async () => {
    // Arrange — the socket the native side still believes in is dead.
    mockState.connectedAddress = "AA:BB";
    mockState.isConnected = true;
    failPrintWith(BROKEN_PIPE);
    failPrintWith(BROKEN_PIPE);

    // Act
    const result = await run(printToPrinter(PRINTER, SEGMENTS));

    // Assert — the row must stop offering Test and start offering Reconnect.
    expect(result.success).toBe(false);
    const health = mockState.health[PRINTER.address]!;
    expect(health.status).toBe("unreachable");
    expect(shouldTestPrint(health.status)).toBe(false);
    expect(health.message).not.toMatch(/broken pipe/i);
  });

  it("marks the printer unreachable when the connection never comes up", async () => {
    // Arrange
    mockBLEPrinter.connectPrinter.mockRejectedValue(new Error("Printer connection timed out after 10s"));
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);

    // Act
    const result = await run(printToPrinter(PRINTER, SEGMENTS));

    // Assert
    expect(result.success).toBe(false);
    const health = mockState.health[PRINTER.address]!;
    expect(health.status).toBe("unreachable");
    expect(health.message).toMatch(/switched on|Reconnect/i);
  });

  it("does not blame the printer when the receipt itself could not be built", async () => {
    // Arrange — a network hop for the tracking URL fails, the printer is fine.
    const failingSource = Promise.reject(new Error("tracking lookup failed"));

    // Act
    const result = await run(printToPrinter(PRINTER, failingSource));

    // Assert — the connection came up, so the printer stays ready.
    expect(result.success).toBe(false);
    expect(mockState.health[PRINTER.address]?.status).toBe("ready");
  });
});

describe("Reconnect", () => {
  it("closes the stale socket before dialling — otherwise the native side skips the reconnect", async () => {
    // Arrange — the store still claims a live connection.
    mockState.connectedAddress = "AA:BB";
    mockState.isConnected = true;
    const order: string[] = [];
    mockBLEPrinter.closeConn.mockImplementation(async () => void order.push("close"));
    mockBLEPrinter.connectPrinter.mockImplementation(async () => {
      order.push("connect");
      return { device_name: "ok" };
    });

    // Act
    const result = await run(reconnectPrinter(PRINTER));

    // Assert
    expect(result.success).toBe(true);
    expect(order).toEqual(["close", "connect"]);
    expect(mockState.health[PRINTER.address]?.status).toBe("ready");
  });

  it("leaves an actionable reason on the row when it fails", async () => {
    // Arrange
    mockBLEPrinter.connectPrinter.mockRejectedValue(new Error("Printer connection timed out after 10s"));
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);

    // Act
    const result = await run(reconnectPrinter(PRINTER));

    // Assert
    expect(result.success).toBe(false);
    expect(mockState.health[PRINTER.address]?.status).toBe("unreachable");
    expect(mockState.health[PRINTER.address]?.message).toBeTruthy();
  });
});

describe("Scan for it", () => {
  it("finds a saved printer that is still in range", async () => {
    // Arrange — the row is showing a failed print.
    mockState.health[PRINTER.address] = { status: "unreachable", message: "dropped" };

    // Act
    const result = await run(findSavedPrinter(PRINTER));

    // Assert — a printer being in range is not yet a connection, so the scan
    // reports what it found and leaves the verdict to the reconnect.
    expect(result.found).toBe(true);
    expect(mockState.health[PRINTER.address]?.message).toBe("dropped");
  });

  it("matches the saved address regardless of case", async () => {
    // Arrange — vendors report MACs in either case.
    mockBLEPrinter.getDeviceList.mockResolvedValue([
      { device_name: "Front", inner_mac_address: "aa:bb" },
    ]);

    // Act
    const result = await run(findSavedPrinter(PRINTER));

    // Assert
    expect(result.found).toBe(true);
  });

  it("says the printer is not nearby when the scan comes back without it", async () => {
    // Arrange — Bluetooth answered; the printer simply is not there.
    mockBLEPrinter.getDeviceList.mockResolvedValue([
      { device_name: "Someone else's speaker", inner_mac_address: "CC:DD" },
    ]);

    // Act
    const result = await run(findSavedPrinter(PRINTER));

    // Assert
    expect(result.found).toBe(false);
    expect(mockState.health[PRINTER.address]?.message).toMatch(/not found nearby/i);
  });
});
