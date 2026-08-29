/**
 * Per-device printer state: the saved printer LIST (with roles), the print
 * trigger, and the kitchen auto-print toggle. The migration matters most: a
 * merchant upgrading from the single-printer build must find their printer
 * still there — holding BOTH roles, because it used to print both the receipt
 * and the kitchen chit.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePrinterStore } from "./printer-store";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const LEGACY = JSON.stringify({ type: "bluetooth", name: "T58", address: "AA:BB" });

function primeStorage(values: Record<string, string | null>) {
  storage.getItem.mockImplementation(async (key: string) => values[key] ?? null);
}

describe("usePrinterStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.getItem.mockResolvedValue(null);
    usePrinterStore.setState({
      printers: [],
      connectedAddress: null,
      isConnected: false,
      printTrigger: "confirmation",
      kitchenAutoPrint: false,
    });
  });

  it("starts with no printers and auto-print off", () => {
    const state = usePrinterStore.getState();
    expect(state.printers).toEqual([]);
    expect(state.kitchenAutoPrint).toBe(false);
    expect(state.isConnected).toBe(false);
  });

  it("adds a printer, assigns an id, and persists the list", async () => {
    const added = await usePrinterStore.getState().addPrinter({
      type: "bluetooth",
      name: "T58",
      address: "AA:BB",
      roles: ["cashier"],
    });

    expect(added.id).toBeTruthy();
    expect(usePrinterStore.getState().printers).toHaveLength(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      "printer_list",
      expect.stringContaining("AA:BB"),
    );
  });

  it("updates roles and removes printers, persisting each change", async () => {
    const added = await usePrinterStore.getState().addPrinter({
      type: "network",
      name: "Hot line",
      address: "10.0.0.5:9100",
      roles: ["kitchen"],
    });

    await usePrinterStore.getState().updatePrinter(added.id, { roles: ["cashier", "kitchen"] });
    expect(usePrinterStore.getState().printers[0]!.roles).toEqual(["cashier", "kitchen"]);

    await usePrinterStore.getState().removePrinter(added.id);
    expect(usePrinterStore.getState().printers).toEqual([]);
    expect(storage.setItem).toHaveBeenLastCalledWith("printer_list", "[]");
  });

  it("derives isConnected from the connected address", () => {
    usePrinterStore.getState().setConnectedAddress("AA:BB");
    expect(usePrinterStore.getState().isConnected).toBe(true);

    usePrinterStore.getState().setConnectedAddress(null);
    expect(usePrinterStore.getState().isConnected).toBe(false);
  });

  it("restores a saved list on start-up", async () => {
    primeStorage({
      printer_list: JSON.stringify([
        { id: "p1", type: "bluetooth", name: "T58", address: "AA:BB", roles: ["cashier"] },
      ]),
    });

    await usePrinterStore.getState().loadSaved();

    expect(usePrinterStore.getState().printers).toHaveLength(1);
  });

  it("migrates the legacy single printer into the list with BOTH roles", async () => {
    primeStorage({ printer_config: LEGACY });

    await usePrinterStore.getState().loadSaved();

    const printers = usePrinterStore.getState().printers;
    expect(printers).toHaveLength(1);
    expect(printers[0]!.roles).toEqual(["cashier", "kitchen"]);
    // The migrated list is written forward so the next launch reads one key.
    expect(storage.setItem).toHaveBeenCalledWith(
      "printer_list",
      expect.stringContaining("AA:BB"),
    );
  });

  it("prefers the new list over the legacy key once both exist", async () => {
    primeStorage({
      printer_list: JSON.stringify([
        { id: "p9", type: "network", name: "New", address: "1.2.3.4:9100", roles: ["kitchen"] },
      ]),
      printer_config: LEGACY,
    });

    await usePrinterStore.getState().loadSaved();

    const printers = usePrinterStore.getState().printers;
    expect(printers).toHaveLength(1);
    expect(printers[0]!.address).toBe("1.2.3.4:9100");
  });

  it("restores the kitchen auto-print toggle", async () => {
    primeStorage({ kitchen_auto_print: "true" });

    await usePrinterStore.getState().loadSaved();

    expect(usePrinterStore.getState().kitchenAutoPrint).toBe(true);
  });

  it("persists the kitchen auto-print toggle", async () => {
    await usePrinterStore.getState().setKitchenAutoPrint(true);

    expect(usePrinterStore.getState().kitchenAutoPrint).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith("kitchen_auto_print", "true");
  });

  it("survives storage rejections — a failed persist never takes the register down", async () => {
    storage.setItem.mockRejectedValue(new Error("disk full"));

    await expect(
      usePrinterStore.getState().addPrinter({
        type: "bluetooth",
        name: "T58",
        address: "AA:BB",
        roles: ["cashier"],
      }),
    ).resolves.toBeTruthy();
    await expect(usePrinterStore.getState().setKitchenAutoPrint(true)).resolves.toBeUndefined();
  });

  it("still restores the print trigger and its legacy migration", async () => {
    primeStorage({ print_trigger: "billout" });
    await usePrinterStore.getState().loadSaved();
    expect(usePrinterStore.getState().printTrigger).toBe("billout");

    primeStorage({ auto_print: "false" });
    await usePrinterStore.getState().loadSaved();
    expect(usePrinterStore.getState().printTrigger).toBe("off");
  });
});
