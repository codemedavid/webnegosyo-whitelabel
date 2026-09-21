import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { migrateAutoPrint, type PrintTrigger } from "../lib/print-trigger";
import type { PrinterHealth, PrinterStatus } from "../lib/printer-health";
import {
  addPrinter as addToList,
  removePrinter as removeFromList,
  updatePrinter as updateInList,
  migrateLegacyPrinter,
  parsePrinterList,
  createPrinterId,
  type RegisteredPrinter,
} from "../lib/printer-registry";

interface PrinterState {
  /** Every printer this device has saved, each holding one or both roles. */
  printers: RegisteredPrinter[];
  /** Address of the printer the native side is currently connected to. */
  connectedAddress: string | null;
  /** Derived compat flag — the dashboard pill reads it. */
  isConnected: boolean;
  /**
   * What this device knows about each printer, keyed by address — the same
   * identity `connectedAddress` uses. Session-only on purpose: a printer that
   * answered yesterday says nothing about the one on the counter now.
   */
  health: Record<string, PrinterHealth>;
  /** When cashier receipts print. Replaces the old `autoPrint` boolean. */
  printTrigger: PrintTrigger;
  /** Auto-print the kitchen chit the moment a new order lands. Per device. */
  kitchenAutoPrint: boolean;
  // Async actions — callers should await these
  addPrinter: (printer: Omit<RegisteredPrinter, "id">) => Promise<RegisteredPrinter>;
  removePrinter: (id: string) => Promise<void>;
  updatePrinter: (id: string, patch: Partial<Omit<RegisteredPrinter, "id">>) => Promise<void>;
  setConnectedAddress: (address: string | null) => void;
  setPrinterHealth: (address: string, status: PrinterStatus, message?: string) => void;
  setPrintTrigger: (trigger: PrintTrigger) => Promise<void>;
  setKitchenAutoPrint: (enabled: boolean) => Promise<void>;
  loadSaved: () => Promise<void>;
}

// Printer config storage keys.
// Security note: Printer config contains device identifiers (name, BT MAC
// address or IP:port) which are not sensitive PII or secrets. AsyncStorage is
// appropriate here. For truly sensitive data use SecureStore instead.
const PRINTER_LIST_KEY = "printer_list";
/** Legacy single-printer key, read once on upgrade; kept for rollback safety. */
const LEGACY_PRINTER_KEY = "printer_config";
/** Legacy boolean, still read once on upgrade so behaviour carries over. */
const AUTO_PRINT_KEY = "auto_print";
const PRINT_TRIGGER_KEY = "print_trigger";
const KITCHEN_AUTO_PRINT_KEY = "kitchen_auto_print";

async function persistList(printers: RegisteredPrinter[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRINTER_LIST_KEY, JSON.stringify(printers));
  } catch (err) {
    console.warn("[PrinterStore] Failed to persist printer list:", err);
  }
}

export const usePrinterStore = create<PrinterState>((set, get) => ({
  printers: [],
  connectedAddress: null,
  isConnected: false,
  health: {},
  printTrigger: "confirmation",
  kitchenAutoPrint: false,
  addPrinter: async (printer) => {
    const registered: RegisteredPrinter = {
      ...printer,
      id: createPrinterId(Date.now(), Math.random()),
    };
    const printers = addToList(get().printers, registered);
    set({ printers });
    await persistList(printers);
    return registered;
  },
  removePrinter: async (id) => {
    const removed = get().printers.find((p) => p.id === id);
    const printers = removeFromList(get().printers, id);
    // Drop the health entry with the printer: re-adding the same address is a
    // fresh start, not an inheritance of yesterday's failure.
    const health = { ...get().health };
    if (removed) delete health[removed.address];
    set({ printers, health });
    await persistList(printers);
  },
  updatePrinter: async (id, patch) => {
    const printers = updateInList(get().printers, id, patch);
    set({ printers });
    await persistList(printers);
  },
  setConnectedAddress: (connectedAddress) =>
    set({ connectedAddress, isConnected: connectedAddress !== null }),
  setPrinterHealth: (address, status, message) =>
    set((state) => ({
      health: { ...state.health, [address]: message ? { status, message } : { status } },
    })),
  setPrintTrigger: async (printTrigger) => {
    set({ printTrigger });
    try {
      await AsyncStorage.setItem(PRINT_TRIGGER_KEY, printTrigger);
    } catch (err) {
      console.warn("[PrinterStore] Failed to persist print trigger:", err);
    }
  },
  setKitchenAutoPrint: async (kitchenAutoPrint) => {
    set({ kitchenAutoPrint });
    try {
      await AsyncStorage.setItem(KITCHEN_AUTO_PRINT_KEY, String(kitchenAutoPrint));
    } catch (err) {
      console.warn("[PrinterStore] Failed to persist kitchen auto-print:", err);
    }
  },
  loadSaved: async () => {
    try {
      // The list key wins. Only when it has never been written does the legacy
      // single printer migrate in — holding BOTH roles, because it used to
      // print both the receipt and the kitchen chit.
      const savedList = await AsyncStorage.getItem(PRINTER_LIST_KEY);
      if (savedList !== null) {
        set({ printers: parsePrinterList(savedList) });
      } else {
        const legacy = await AsyncStorage.getItem(LEGACY_PRINTER_KEY);
        const migrated = migrateLegacyPrinter(legacy);
        if (migrated.length > 0) {
          set({ printers: migrated });
          await persistList(migrated);
        }
      }

      const kitchenAutoPrint = await AsyncStorage.getItem(KITCHEN_AUTO_PRINT_KEY);
      if (kitchenAutoPrint !== null) {
        set({ kitchenAutoPrint: kitchenAutoPrint === "true" });
      }

      // Same precedence for the trigger: the new key wins; only when it is
      // absent does the legacy boolean get read, so a merchant who has since
      // chosen a trigger is not dragged back to whatever `auto_print` says.
      const trigger = await AsyncStorage.getItem(PRINT_TRIGGER_KEY);
      if (trigger !== null) {
        set({ printTrigger: trigger as PrintTrigger });
        return;
      }

      const legacyAuto = await AsyncStorage.getItem(AUTO_PRINT_KEY);
      set({ printTrigger: migrateAutoPrint(legacyAuto === null ? null : JSON.parse(legacyAuto)) });
    } catch {
      // Silently fail on corrupt storage
    }
  },
}));
