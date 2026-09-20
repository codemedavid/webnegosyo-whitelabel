/**
 * Two Android failures a merchant hits on the counter, both reported from the
 * field (2026-09-19): "failed to print data: Broken pipe" on every test print,
 * and "Bluetooth permission needed / Location permission is required for
 * Bluetooth scanning on this Android version" with no system dialog ever
 * shown.
 *
 * 1. BROKEN PIPE. Android's BluetoothSocket.isConnected() reports the LOCAL
 *    socket state only, so a printer that slept, was switched off, or drifted
 *    out of range leaves a socket that still claims to be connected. The write
 *    then throws "Broken pipe" — and the native side takes that same claim as
 *    proof it need not reconnect (BLEPrinterAdapter.selectDevice: "do not need
 *    to reconnect"), so our retry connects to nothing and sends the receipt
 *    down the very same dead socket. Closing the connection first is what
 *    turns the retry into a real reconnection.
 *
 * 2. LOCATION PERMISSION. The Android adapter enumerates BONDED devices
 *    (BluetoothAdapter.getBondedDevices) — it never runs a BLE scan — so
 *    ACCESS_FINE_LOCATION buys nothing. It is also declared in no manifest in
 *    this app, which means PermissionsAndroid.request resolves "never_ask_again"
 *    without showing a dialog: on any pre-Android-12 tablet the merchant can
 *    never add a printer at all.
 *
 * RED before the fix (retry prints on the dead socket; pre-12 scan refused),
 * GREEN after.
 */

const platform = { OS: "android", Version: 33, select: (map: Record<string, unknown>) => map.android };

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { appOwnership: null }, // a real build, not Expo Go
}));

const requestMultiple = jest.fn();
const request = jest.fn();

jest.mock("react-native", () => ({
  Platform: platform,
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: "android.permission.BLUETOOTH_SCAN",
      BLUETOOTH_CONNECT: "android.permission.BLUETOOTH_CONNECT",
      ACCESS_FINE_LOCATION: "android.permission.ACCESS_FINE_LOCATION",
    },
    RESULTS: { GRANTED: "granted", DENIED: "denied", NEVER_ASK_AGAIN: "never_ask_again" },
    requestMultiple,
    request,
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
const mockNetPrinter = {
  init: jest.fn(),
  getDeviceList: jest.fn(),
  connectPrinter: jest.fn(),
  closeConn: jest.fn(),
  printBill: jest.fn(),
  printImageBase64: jest.fn(),
};

jest.mock("@haroldtran/react-native-thermal-printer", () => ({
  BLEPrinter: mockBLEPrinter,
  NetPrinter: mockNetPrinter,
}));

const mockState = {
  printers: [] as unknown[],
  connectedAddress: null as string | null,
  isConnected: false,
  setConnectedAddress: (address: string | null) => {
    mockState.connectedAddress = address;
    mockState.isConnected = address !== null;
  },
};

jest.mock("../stores/printer-store", () => ({
  usePrinterStore: { getState: () => mockState },
}));

import { printToPrinter, requestBluetoothPermissions } from "./printer";
import type { RegisteredPrinter } from "./printer-registry";

const PRINTER: RegisteredPrinter = {
  id: "cash",
  type: "bluetooth",
  name: "Front",
  address: "AA:BB",
  roles: ["cashier"],
};

const SEGMENTS = [{ type: "text" as const, text: "hello" }];

/** The exact string the native adapter hands back on a dead socket. */
const BROKEN_PIPE = "failed to print data: Broken pipe";

/** Make printBill fail through its onError callback, like the native side does. */
function failPrintWith(message: string) {
  mockBLEPrinter.printBill.mockImplementationOnce(
    (_text: string, opts: { onError?: (err: Error) => void }) => {
      opts?.onError?.(new Error(message));
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  platform.OS = "android";
  platform.Version = 33;
  mockState.printers = [PRINTER];
  mockState.connectedAddress = null;
  mockState.isConnected = false;
  mockBLEPrinter.init.mockResolvedValue(undefined);
  mockBLEPrinter.connectPrinter.mockResolvedValue({ device_name: "ok" });
  mockBLEPrinter.closeConn.mockResolvedValue(undefined);
  mockBLEPrinter.getDeviceList.mockResolvedValue([
    { device_name: "Front", inner_mac_address: "AA:BB" },
  ]);
  mockNetPrinter.init.mockResolvedValue(undefined);
  mockNetPrinter.connectPrinter.mockResolvedValue({ device_name: "ok" });
  mockNetPrinter.closeConn.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then((v) => v);
  await jest.runAllTimersAsync();
  return settled;
}

describe("broken pipe — a stale socket the native side believes is live", () => {
  it("closes the native connection before reconnecting, so the retry is a real reconnection", async () => {
    mockState.connectedAddress = "AA:BB";
    mockState.isConnected = true;
    failPrintWith(BROKEN_PIPE);

    const order: string[] = [];
    mockBLEPrinter.closeConn.mockImplementation(async () => {
      order.push("close");
    });
    mockBLEPrinter.connectPrinter.mockImplementation(async () => {
      order.push("connect");
      return { device_name: "ok" };
    });

    const result = await run(printToPrinter(PRINTER, SEGMENTS));

    expect(result.success).toBe(true);
    expect(order).toEqual(["close", "connect"]);
    expect(mockBLEPrinter.printBill).toHaveBeenCalledTimes(2);
    expect(mockState.connectedAddress).toBe("AA:BB");
  });

  it("does not leave the store claiming a connection when the reconnect also fails", async () => {
    mockState.connectedAddress = "AA:BB";
    mockState.isConnected = true;
    failPrintWith(BROKEN_PIPE);
    mockBLEPrinter.connectPrinter.mockRejectedValue(new Error("printer off"));
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);

    const result = await run(printToPrinter(PRINTER, SEGMENTS));

    expect(result.success).toBe(false);
    expect(mockState.connectedAddress).toBeNull();
  });

  it("reports a dropped connection in words a merchant can act on, not 'Broken pipe'", async () => {
    mockState.connectedAddress = "AA:BB";
    mockState.isConnected = true;
    // Both the print and its retry hit the dead socket.
    failPrintWith(BROKEN_PIPE);
    failPrintWith(BROKEN_PIPE);

    const result = await run(printToPrinter(PRINTER, SEGMENTS));

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/broken pipe/i);
    expect(result.error).toMatch(/printer/i);
  });

  it("closes the network connection too — a stale TCP socket fails the same way", async () => {
    const netPrinter: RegisteredPrinter = {
      id: "kit",
      type: "network",
      name: "Kitchen",
      address: "10.0.0.5:9100",
      roles: ["kitchen"],
    };
    mockState.printers = [netPrinter];
    mockState.connectedAddress = "10.0.0.5:9100";
    mockState.isConnected = true;
    mockNetPrinter.printBill.mockImplementationOnce(
      (_text: string, opts: { onError?: (err: Error) => void }) => {
        opts?.onError?.(new Error(BROKEN_PIPE));
      },
    );

    const result = await run(printToPrinter(netPrinter, SEGMENTS));

    expect(result.success).toBe(true);
    expect(mockNetPrinter.closeConn).toHaveBeenCalled();
  });
});

describe("requestBluetoothPermissions on Android", () => {
  it("never asks for location below Android 12 — the adapter reads bonded devices, it does not scan", async () => {
    platform.Version = 30;

    const result = await requestBluetoothPermissions();

    expect(result).toEqual({ success: true });
    expect(request).not.toHaveBeenCalled();
  });

  it("allows the scan on Android 12+ when CONNECT is granted but SCAN is denied", async () => {
    requestMultiple.mockResolvedValue({
      "android.permission.BLUETOOTH_CONNECT": "granted",
      "android.permission.BLUETOOTH_SCAN": "denied",
    });

    const result = await requestBluetoothPermissions();

    expect(result).toEqual({ success: true });
  });

  it("refuses on Android 12+ when CONNECT is denied — bonded devices are unreadable without it", async () => {
    requestMultiple.mockResolvedValue({
      "android.permission.BLUETOOTH_CONNECT": "denied",
      "android.permission.BLUETOOTH_SCAN": "granted",
    });

    const result = await requestBluetoothPermissions();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/bluetooth/i);
    expect(result.error).not.toMatch(/location/i);
  });
});
