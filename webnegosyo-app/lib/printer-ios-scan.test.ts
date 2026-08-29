/**
 * Regression tests for iOS Bluetooth printer DISCOVERY ("it keeps on loading
 * and never detects any printer on iOS, but Android works fine").
 *
 * Three native behaviours our layer must survive, all iOS-only:
 *
 * 1. CoreBluetooth is not ready when we scan. RNBLEPrinter.m `init` calls
 *    `scanPrintersWithCompletion` immediately and the vendor source itself
 *    documents the defect: "API MISUSE: <CBCentralManager> can only accept
 *    this command while in the powered on state". CBCentralManager needs
 *    roughly 0.5-2s to reach CBManagerStatePoweredOn after it is first
 *    instantiated, and iOS silently DROPS any scan issued before then. We call
 *    getDeviceList milliseconds after init resolves, so the first scan after
 *    an app launch never actually starts.
 *
 * 2. getDeviceList never calls back when nothing is found. Its
 *    successCallback fires only from INSIDE the per-printer discovery block,
 *    so an empty room produces no callback at all — the promise hangs until
 *    our timeout. One dropped scan window therefore costs the whole scan.
 *
 * 3. Android has neither problem: getDeviceList resolves synchronously from
 *    the bonded-device list. The fix must not slow Android down.
 *
 * RED before the fix (scan fires immediately with no warm-up; a single
 * timed-out window gives up and reports nothing found), GREEN after.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  // A development/production build, NOT Expo Go — the native module exists.
  default: { appOwnership: null },
}));

const mockPlatform = { OS: "ios", Version: 17, select: (map: Record<string, unknown>) => map.ios };

jest.mock("react-native", () => ({
  get Platform() {
    return mockPlatform;
  },
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
    setConnectedAddress: jest.fn(),
  };
  return { usePrinterStore: { getState: () => state } };
});

/** A promise that never settles — the native callback that never fires. */
const never = () => new Promise<never>(() => {});

/**
 * Drain every pending microtask without advancing the clock, so "has the scan
 * started yet?" measures the code under test rather than how many promise ticks
 * the await chain happens to take.
 */
const flushMicrotasks = async () => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
};

const POS58 = { device_name: "POS-58", inner_mac_address: "AA:BB:CC:DD:EE:FF" };

describe("lib/printer.ts — iOS Bluetooth discovery", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPlatform.OS = "ios";
    mockPlatform.Version = 17;
    // Re-establish the working native module for every test: the
    // missing-module test below replaces this factory, and a doMock survives
    // resetModules, so without this the leak would silently disable the
    // native module for every test that runs after it.
    jest.doMock("@haroldtran/react-native-thermal-printer", () => ({
      BLEPrinter: mockBLEPrinter,
      NetPrinter: mockNetPrinter,
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("waits for CoreBluetooth to power on before the first iOS scan", async () => {
    // Arrange: init resolves at once, as the native module does.
    mockBLEPrinter.init.mockResolvedValue(undefined);
    mockBLEPrinter.getDeviceList.mockResolvedValue([POS58]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverBluetoothPrinters } = require("./printer");

    // Act: start a scan and let only the init microtasks drain.
    const pending = discoverBluetoothPrinters();
    await flushMicrotasks();

    // Assert: scanning immediately after init is the bug — iOS drops that scan.
    expect(mockBLEPrinter.getDeviceList).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);
    await pending;
    expect(mockBLEPrinter.getDeviceList).toHaveBeenCalled();
  });

  it("retries the scan when an iOS scan window is dropped and never calls back", async () => {
    mockBLEPrinter.init.mockResolvedValue(undefined);
    // First window is the one iOS silently dropped: no callback, ever.
    // A later window, once the radio is genuinely up, finds the printer.
    mockBLEPrinter.getDeviceList
      .mockImplementationOnce(never)
      .mockResolvedValue([POS58]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverBluetoothPrinters } = require("./printer");

    const pending = discoverBluetoothPrinters();
    await jest.advanceTimersByTimeAsync(120_000);
    const result = await pending;

    expect(mockBLEPrinter.getDeviceList.mock.calls.length).toBeGreaterThan(1);
    expect(result.printers).toEqual([{ name: "POS-58", address: "AA:BB:CC:DD:EE:FF" }]);
    expect(result.status).toBe("ok");
  });

  it("reports a timeout status, not a bare empty list, when every iOS scan window is dropped", async () => {
    mockBLEPrinter.init.mockResolvedValue(undefined);
    mockBLEPrinter.getDeviceList.mockImplementation(never);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverBluetoothPrinters } = require("./printer");

    const pending = discoverBluetoothPrinters();
    await jest.advanceTimersByTimeAsync(300_000);
    const result = await pending;

    // "Bluetooth never answered" and "Bluetooth answered, nothing paired" are
    // different merchant problems and must not share one message.
    expect(result.status).toBe("timeout");
    expect(result.printers).toEqual([]);
  });

  it("reports an empty-but-successful scan distinctly from a dropped scan", async () => {
    mockBLEPrinter.init.mockResolvedValue(undefined);
    mockBLEPrinter.getDeviceList.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverBluetoothPrinters } = require("./printer");

    const pending = discoverBluetoothPrinters();
    await jest.advanceTimersByTimeAsync(300_000);
    const result = await pending;

    expect(result.status).toBe("ok");
    expect(result.printers).toEqual([]);
  });

  it("reports unavailable when the native module is missing from the build", async () => {
    jest.doMock("@haroldtran/react-native-thermal-printer", () => {
      throw new Error("module not linked");
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverBluetoothPrinters } = require("./printer");

    const result = await discoverBluetoothPrinters();

    // A pod missing from the build must never read as "no printers in range".
    expect(result.status).toBe("unavailable");
    expect(result.printers).toEqual([]);
  });

  it("does not impose the iOS warm-up delay on Android", async () => {
    mockPlatform.OS = "android";
    mockPlatform.Version = 33;
    mockBLEPrinter.init.mockResolvedValue(undefined);
    mockBLEPrinter.getDeviceList.mockResolvedValue([POS58]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverBluetoothPrinters } = require("./printer");

    const pending = discoverBluetoothPrinters();
    await flushMicrotasks();

    // Android already works; it must keep scanning immediately.
    expect(mockBLEPrinter.getDeviceList).toHaveBeenCalledTimes(1);

    const result = await pending;
    expect(result.printers).toEqual([{ name: "POS-58", address: "AA:BB:CC:DD:EE:FF" }]);
  });
});
