import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface PrinterConfig {
  type: "bluetooth" | "network";
  name: string;
  address: string; // MAC address for BT, IP:port for network
}

interface PrinterState {
  printer: PrinterConfig | null;
  isConnected: boolean;
  autoPrint: boolean;
  // Async actions — callers should await these
  setPrinter: (printer: PrinterConfig | null) => Promise<void>;
  setConnected: (connected: boolean) => void;
  setAutoPrint: (auto: boolean) => Promise<void>;
  loadSaved: () => Promise<void>;
}

// Printer config storage key.
// Security note: Printer config contains device identifiers (name, BT MAC address or IP:port)
// which are not sensitive PII or secrets. AsyncStorage is appropriate here.
// For truly sensitive data (tokens, passwords), use react-native-keychain or SecureStore instead.
const STORAGE_KEY = "printer_config";
const AUTO_PRINT_KEY = "auto_print";

export const usePrinterStore = create<PrinterState>((set) => ({
  printer: null,
  isConnected: false,
  autoPrint: true,
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
  setAutoPrint: async (autoPrint) => {
    set({ autoPrint });
    try {
      await AsyncStorage.setItem(AUTO_PRINT_KEY, JSON.stringify(autoPrint));
    } catch (err) {
      console.warn("[PrinterStore] Failed to persist autoPrint setting:", err);
    }
  },
  loadSaved: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const autoPrint = await AsyncStorage.getItem(AUTO_PRINT_KEY);
      if (saved) {
        set({ printer: JSON.parse(saved) });
      }
      if (autoPrint !== null) {
        set({ autoPrint: JSON.parse(autoPrint) });
      }
    } catch {
      // Silently fail on corrupt storage
    }
  },
}));
