import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { migrateAutoPrint, type PrintTrigger } from "../lib/print-trigger";

interface PrinterConfig {
  type: "bluetooth" | "network";
  name: string;
  address: string; // MAC address for BT, IP:port for network
}

interface PrinterState {
  printer: PrinterConfig | null;
  isConnected: boolean;
  /** When receipts print. Replaces the old `autoPrint` boolean. */
  printTrigger: PrintTrigger;
  // Async actions — callers should await these
  setPrinter: (printer: PrinterConfig | null) => Promise<void>;
  setConnected: (connected: boolean) => void;
  setPrintTrigger: (trigger: PrintTrigger) => Promise<void>;
  loadSaved: () => Promise<void>;
}

// Printer config storage key.
// Security note: Printer config contains device identifiers (name, BT MAC address or IP:port)
// which are not sensitive PII or secrets. AsyncStorage is appropriate here.
// For truly sensitive data (tokens, passwords), use react-native-keychain or SecureStore instead.
const STORAGE_KEY = "printer_config";
/** Legacy boolean, still read once on upgrade so behaviour carries over. */
const AUTO_PRINT_KEY = "auto_print";
const PRINT_TRIGGER_KEY = "print_trigger";

export const usePrinterStore = create<PrinterState>((set) => ({
  printer: null,
  isConnected: false,
  printTrigger: "confirmation",
  setPrinter: async (printer) => {
    set({ printer });
    try {
      if (printer) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(printer));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn("[PrinterStore] Failed to persist printer config:", err);
    }
  },
  setConnected: (isConnected) => set({ isConnected }),
  setPrintTrigger: async (printTrigger) => {
    set({ printTrigger });
    try {
      await AsyncStorage.setItem(PRINT_TRIGGER_KEY, printTrigger);
    } catch (err) {
      console.warn("[PrinterStore] Failed to persist print trigger:", err);
    }
  },
  loadSaved: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        set({ printer: JSON.parse(saved) });
      }

      // The new key wins. Only when it is absent does the legacy boolean get
      // read, so a merchant who has since chosen a trigger is not dragged back
      // to whatever `auto_print` still says.
      const trigger = await AsyncStorage.getItem(PRINT_TRIGGER_KEY);
      if (trigger !== null) {
        set({ printTrigger: trigger as PrintTrigger });
        return;
      }

      const legacy = await AsyncStorage.getItem(AUTO_PRINT_KEY);
      set({ printTrigger: migrateAutoPrint(legacy === null ? null : JSON.parse(legacy)) });
    } catch {
      // Silently fail on corrupt storage
    }
  },
}));
