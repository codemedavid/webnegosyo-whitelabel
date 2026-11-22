/**
 * "SmartMenu keeps stopping" right after opening, on Android (2026-11-21).
 *
 * Reproduced on an Android 15 emulator with the shipped 1.0.22 APK: a saved
 * Bluetooth printer + the "Nearby devices" (BLUETOOTH_CONNECT) grant missing
 * = the app dies ~2s after every launch:
 *
 *   FATAL EXCEPTION … java.lang.SecurityException: Need
 *   android.permission.BLUETOOTH_CONNECT permission … getBondedDevices
 *     at BLEPrinterAdapter.selectDevice(BLEPrinterAdapter.java:208)
 *     at RNBLEPrinterModule.connectPrinter(RNBLEPrinterModule.java:55)
 *
 * The launch-time printer warm-up calls the driver's connectPrinter, the
 * driver lists bonded devices, and a SecurityException on React Native's
 * module thread is a process crash, not a rejected promise. Android takes the
 * grant away on its own (unused-app permission reset, a restored phone, a
 * "Don't allow"), so a printer that worked yesterday can brick the app today.
 *
 * This suite pins the guard: with the grant missing, NOTHING reaches the
 * Bluetooth driver on the paths that run unattended, the printer row says why,
 * and only a Reconnect tap asks for the permission again.
 */

const mockPlatform = { OS: "android", Version: 34 as number, select: (map: Record<string, unknown>) => map.android };
const mockCheck = jest.fn();
const mockRequestMultiple = jest.fn();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { appOwnership: null }, // a real build, not Expo Go
}));

jest.mock("react-native", () => ({
  Platform: mockPlatform,
  PermissionsAndroid: {
    PERMISSIONS: { BLUETOOTH_SCAN: "scan", BLUETOOTH_CONNECT: "connect" },
    RESULTS: { GRANTED: "granted", DENIED: "denied" },
    check: (...args: unknown[]) => mockCheck(...args),
    requestMultiple: (...args: unknown[]) => mockRequestMultiple(...args),
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
const mockNetPrinter = { ...mockBLEPrinter, init: jest.fn(), connectPrinter: jest.fn(), printBill: jest.fn() };

jest.mock("@haroldtran/react-native-thermal-printer", () => ({
  BLEPrinter: mockBLEPrinter,
  NetPrinter: mockNetPrinter,
}));

const mockState = {
  printers: [] as unknown[],
  connectedAddress: null as string | null,
  setConnectedAddress: (address: string | null) => {
    mockState.connectedAddress = address;
  },
  health: {} as Record<string, { status: string; message?: string }>,
  setPrinterHealth: (address: string, status: string, message?: string) => {
    mockState.health[address] = message ? { status, message } : { status };
  },
};

jest.mock("../stores/printer-store", () => ({
  usePrinterStore: { getState: () => mockState },
}));

import {
  BLUETOOTH_PERMISSION_MSG,
  bluetoothNeedsRuntimePermission,
  connectPrinter,
  discoverBluetoothPrinters,
  findSavedPrinter,
  printToPrinter,
  reconnectPrinter,
  warmUpPrinter,
} from "./printer";
import type { RegisteredPrinter } from "./printer-registry";

const BT_PRINTER: RegisteredPrinter = {
  id: "cash",
  type: "bluetooth",
  name: "POS-58",
  address: "66:22:B3:7A:01:02",
  roles: ["cashier", "kitchen"],
};

const NET_PRINTER: RegisteredPrinter = {
  id: "kitchen",
  type: "network",
  name: "Kitchen",
  address: "192.168.1.50:9100",
  roles: ["kitchen"],
};

const SEGMENTS = [{ type: "text" as const, text: "hello" }];

/** Every Bluetooth driver call that can reach getBondedDevices or the radio. */
function bluetoothDriverCalls(): number {
  return (
    mockBLEPrinter.init.mock.calls.length +
    mockBLEPrinter.connectPrinter.mock.calls.length +
    mockBLEPrinter.getDeviceList.mock.calls.length +
    mockBLEPrinter.printBill.mock.calls.length
  );
}

async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then((v) => v);
  await jest.runAllTimersAsync();
  return settled;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockPlatform.OS = "android";
  mockPlatform.Version = 34;
  mockState.printers = [BT_PRINTER];
  mockState.connectedAddress = null;
  mockState.health = {};
  mockCheck.mockResolvedValue(false); // the grant Android took away
  mockRequestMultiple.mockResolvedValue({ scan: "denied", connect: "denied" });
  for (const driver of [mockBLEPrinter, mockNetPrinter]) {
    driver.init.mockResolvedValue(undefined);
    driver.connectPrinter.mockResolvedValue({ device_name: "ok" });
    driver.closeConn.mockResolvedValue(undefined);
    driver.printBill.mockImplementation(() => undefined);
  }
  mockBLEPrinter.getDeviceList.mockResolvedValue([{ device_name: "POS-58", inner_mac_address: BT_PRINTER.address }]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Bluetooth printing with \"Nearby devices\" switched off", () => {
  it("the launch warm-up never calls the Bluetooth driver (this was the crash)", async () => {
    // Act — exactly what PrinterWarmUp does 1.5s after every launch.
    const result = await run(warmUpPrinter(BT_PRINTER));

    // Assert
    expect(bluetoothDriverCalls()).toBe(0);
    expect(result).toEqual({ success: false, error: BLUETOOTH_PERMISSION_MSG });
    expect(mockRequestMultiple).not.toHaveBeenCalled(); // no dialog at launch
  });

  it("an auto-printed receipt or chit fails quietly instead of crashing", async () => {
    const result = await run(printToPrinter(BT_PRINTER, SEGMENTS));

    expect(bluetoothDriverCalls()).toBe(0);
    expect(result.success).toBe(false);
    expect(mockRequestMultiple).not.toHaveBeenCalled();
  });

  it("the printer row says why, so the merchant knows what to tap", async () => {
    await run(connectPrinter("bluetooth", BT_PRINTER.address));

    expect(mockState.health[BT_PRINTER.address]).toEqual({
      status: "unreachable",
      message: BLUETOOTH_PERMISSION_MSG,
    });
    expect(mockState.connectedAddress).toBeNull();
  });

  it("a scan reports the missing grant instead of listing bonded devices", async () => {
    const scan = await run(discoverBluetoothPrinters());

    expect(scan).toEqual({ printers: [], status: "denied" });
    expect(bluetoothDriverCalls()).toBe(0);
  });

  it("\"Scan for it\" on a saved printer explains the grant, not 'out of range'", async () => {
    const outcome = await run(findSavedPrinter(BT_PRINTER));

    expect(outcome.found).toBe(false);
    expect(mockState.health[BT_PRINTER.address]?.message).toBe(BLUETOOTH_PERMISSION_MSG);
    expect(bluetoothDriverCalls()).toBe(0);
  });

  it("treats a permission check that throws as 'not allowed'", async () => {
    mockCheck.mockRejectedValue(new Error("binder died"));

    const result = await run(warmUpPrinter(BT_PRINTER));

    expect(result.success).toBe(false);
    expect(bluetoothDriverCalls()).toBe(0);
  });

  it("Reconnect asks for the permission and stays off the driver when refused", async () => {
    const result = await run(reconnectPrinter(BT_PRINTER));

    expect(mockRequestMultiple).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: false, error: BLUETOOTH_PERMISSION_MSG });
    expect(bluetoothDriverCalls()).toBe(0);
  });

  it("Reconnect connects once the merchant allows it", async () => {
    // Arrange — the dialog grants it; the next check sees the grant.
    mockRequestMultiple.mockImplementation(async () => {
      mockCheck.mockResolvedValue(true);
      return { scan: "granted", connect: "granted" };
    });

    // Act
    const result = await run(reconnectPrinter(BT_PRINTER));

    // Assert
    expect(result).toEqual({ success: true });
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledWith(BT_PRINTER.address);
    expect(mockState.health[BT_PRINTER.address]).toEqual({ status: "ready" });
  });

  it("never blocks a network printer — it needs no Bluetooth grant", async () => {
    mockState.printers = [NET_PRINTER];

    const result = await run(printToPrinter(NET_PRINTER, SEGMENTS));

    expect(result).toEqual({ success: true });
    expect(mockNetPrinter.connectPrinter).toHaveBeenCalledWith("192.168.1.50", 9100);
    expect(mockCheck).not.toHaveBeenCalled();
  });
});

describe("Bluetooth printing with the grant in place", () => {
  it("connects as before when Android 12+ has the grant", async () => {
    mockCheck.mockResolvedValue(true);

    const result = await run(warmUpPrinter(BT_PRINTER));

    expect(result).toEqual({ success: true });
    expect(mockCheck).toHaveBeenCalledWith("connect");
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledWith(BT_PRINTER.address);
  });

  it("does not ask Android 11 and older, where Bluetooth is granted at install", async () => {
    mockPlatform.Version = 30;

    const result = await run(warmUpPrinter(BT_PRINTER));

    expect(result).toEqual({ success: true });
    expect(mockCheck).not.toHaveBeenCalled();
  });
});

describe("bluetoothNeedsRuntimePermission", () => {
  it.each([
    ["android", 31, true],
    ["android", 35, true],
    ["android", 30, false],
    ["android", "31", false], // never trust a non-number version
    ["ios", 18, false],
  ])("%s %p → %p", (os, version, expected) => {
    expect(bluetoothNeedsRuntimePermission(os, version)).toBe(expected);
  });
});
