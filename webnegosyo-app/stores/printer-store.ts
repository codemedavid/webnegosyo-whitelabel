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
  setPrinter: (printer: PrinterConfig | null) => void;
  setConnected: (connected: boolean) => void;
  setAutoPrint: (auto: boolean) => void;
  loadSaved: () => Promise<void>;
}

const STORAGE_KEY = "printer_config";

export const usePrinterStore = create<PrinterState>((set) => ({
  printer: null,
  isConnected: false,
  autoPrint: true,
  setPrinter: async (printer) => {
    set({ printer });
    if (printer) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(printer));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  },
  setConnected: (isConnected) => set({ isConnected }),
  setAutoPrint: async (autoPrint) => {
    set({ autoPrint });
    await AsyncStorage.setItem("auto_print", JSON.stringify(autoPrint));
  },
  loadSaved: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const autoPrint = await AsyncStorage.getItem("auto_print");
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
