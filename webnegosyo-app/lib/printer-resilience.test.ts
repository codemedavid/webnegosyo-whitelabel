/**
 * Regression tests for lib/printer.ts hangs and post-relaunch reconnect
 * failures ("sometimes it's not even connecting").
 *
 * Two native behaviours our layer must survive:
 *
 * 1. iOS getDeviceList only fires its callback when a printer is DISCOVERED —
 *    if none is in range the promise never settles, so a scan (and any
 *    connect that never calls back) hangs the UI forever without a timeout.
 *
 * 2. iOS connectPrinter only searches the in-memory candidate list built by
 *    scanning. After an app relaunch a saved printer is unknown to the native
 *    side, so the first reconnect-before-print fails until a scan re-finds
 *    it. Our connect must rescan and retry once instead of giving up.
 *
 * RED before the fix (hang → jest timeout; no retry → failure result), GREEN
 * after (timeouts + scan-and-retry in lib/printer.ts).
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  // A development/production build, NOT Expo Go — the native module exists.
  default: { appOwnership: null },
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
};
const mockNetPrinter = {
  init: jest.fn(),
  connectPrinter: jest.fn(),
  closeConn: jest.fn(),
  printBill: jest.fn(),
};

jest.mock("@haroldtran/react-native-thermal-printer", () => ({
  BLEPrinter: mockBLEPrinter,
  NetPrinter: mockNetPrinter,
}));

jest.mock("../stores/printer-store", () => {
  const state = {
    printers: [] as unknown[],
    connectedAddress: null as string | null,
    isConnected: false,
    setConnectedAddress: jest.fn((address: string | null) => {
      state.connectedAddress = address;
      state.isConnected = address !== null;
    }),
    health: {} as Record<string, { status: string; message?: string }>,
    setPrinterHealth: jest.fn((address: string, status: string, message?: string) => {
      state.health[address] = message ? { status, message } : { status };
    }),
  };
  return { usePrinterStore: { getState: () => state } };
});

/** A promise that never settles — the native callback that never fires. */
const never = () => new Promise<never>(() => {});

describe("lib/printer.ts — timeouts and reconnect resilience", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("discoverBluetoothPrinters settles instead of hanging when no printer is ever discovered", async () => {
    mockBLEPrinter.init.mockResolvedValue(undefined);
    mockBLEPrinter.getDeviceList.mockImplementation(never);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverBluetoothPrinters } = require("./printer");

    const pending = discoverBluetoothPrinters();
    await jest.advanceTimersByTimeAsync(300_000);
    await expect(pending).resolves.toEqual({ printers: [], status: "timeout" });
  });

  it("connectPrinter returns a failure result instead of hanging when the native connect never calls back", async () => {
    mockBLEPrinter.init.mockResolvedValue(undefined);
    mockBLEPrinter.connectPrinter.mockImplementation(never);
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { connectPrinter } = require("./printer");

    const pending = connectPrinter("bluetooth", "AA:BB:CC:DD:EE:FF");
    await jest.advanceTimersByTimeAsync(120_000);
    const result = await pending;
    expect(result.success).toBe(false);
    // The raw "timed out after 10s" is translated on its way out: a cashier
    // needs the next action, not the native string. What this test pins is
    // that the call SETTLES with a failure rather than hanging forever.
    expect(result.error).toMatch(/switched on and in range/i);
  });

  it("connectPrinter rescans and retries once when a saved printer is unknown to the native side (post-relaunch)", async () => {
    mockBLEPrinter.init.mockResolvedValue(undefined);
    // First attempt: native has an empty candidate list after relaunch.
    mockBLEPrinter.connectPrinter
      .mockRejectedValueOnce(new Error("connectPrinter: Can't connect to printer AA:BB:CC:DD:EE:FF"))
      .mockResolvedValueOnce({ device_name: "POS-58" });
    // The rescan re-finds the saved printer.
    mockBLEPrinter.getDeviceList.mockResolvedValue([
      { device_name: "POS-58", inner_mac_address: "AA:BB:CC:DD:EE:FF" },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { connectPrinter } = require("./printer");

    const pending = connectPrinter("bluetooth", "AA:BB:CC:DD:EE:FF");
    await jest.advanceTimersByTimeAsync(60_000);
    const result = await pending;

    expect(result).toEqual({ success: true });
    expect(mockBLEPrinter.connectPrinter).toHaveBeenCalledTimes(2);
    expect(mockBLEPrinter.getDeviceList).toHaveBeenCalledTimes(1);
  });

  it("network connectPrinter returns a failure result instead of hanging when the native connect never calls back", async () => {
    mockNetPrinter.init.mockResolvedValue(undefined);
    mockNetPrinter.connectPrinter.mockImplementation(never);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { connectPrinter } = require("./printer");

    const pending = connectPrinter("network", "192.168.1.50:9100");
    await jest.advanceTimersByTimeAsync(120_000);
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/switched on and in range/i);
  });
});
