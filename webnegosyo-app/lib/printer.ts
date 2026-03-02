import { Alert, Platform } from "react-native";
import { usePrinterStore } from "../stores/printer-store";

// ESC/POS commands for text formatting
const ESC = "\x1B";
const GS = "\x1D";
const COMMANDS = {
  INIT: `${ESC}@`,           // Initialize printer
  ALIGN_CENTER: `${ESC}a1`,
  ALIGN_LEFT: `${ESC}a0`,
  BOLD_ON: `${ESC}E1`,
  BOLD_OFF: `${ESC}E0`,
  DOUBLE_HEIGHT: `${GS}!0x10`,
  NORMAL_SIZE: `${GS}!0x00`,
  CUT: `${GS}VA`,            // Full cut
  FEED: `${ESC}d\x03`,       // Feed 3 lines
};

let printerModule: any = null;

async function getPrinterModule() {
  if (!printerModule) {
    try {
      printerModule = require("react-native-esc-pos-printer");
    } catch {
      return null;
    }
  }
  return printerModule;
}

export async function discoverBluetoothPrinters(): Promise<Array<{ name: string; address: string }>> {
  const mod = await getPrinterModule();
  if (!mod) return [];

  try {
    const devices = await mod.default.discover({ type: "bluetooth" });
    return (devices ?? []).map((d: any) => ({
      name: d.name || d.deviceName || "Unknown Printer",
      address: d.address || d.macAddress,
    }));
  } catch (err: any) {
    console.warn("Bluetooth discovery failed:", err?.message);
    return [];
  }
}

export async function connectPrinter(type: "bluetooth" | "network", address: string): Promise<boolean> {
  const mod = await getPrinterModule();
  if (!mod) {
    Alert.alert("Printer Error", "Printer module not available. Please rebuild the app with native modules.");
    return false;
  }

  try {
    if (type === "bluetooth") {
      await mod.default.connect({ type: "bluetooth", address });
    } else {
      const [ip, port] = address.split(":");
      await mod.default.connect({ type: "tcp", address: ip, port: parseInt(port || "9100", 10) });
    }
    usePrinterStore.getState().setConnected(true);
    return true;
  } catch (err: any) {
    console.warn("Printer connection failed:", err?.message);
    usePrinterStore.getState().setConnected(false);
    return false;
  }
}

export async function disconnectPrinter(): Promise<void> {
  const mod = await getPrinterModule();
  if (!mod) return;
  try {
    await mod.default.disconnect();
  } catch {
    // Ignore disconnect errors
  }
  usePrinterStore.getState().setConnected(false);
}

export async function printReceipt(receiptText: string): Promise<boolean> {
  const mod = await getPrinterModule();
  if (!mod) return false;

  const { printer, isConnected } = usePrinterStore.getState();
  if (!printer) return false;

  try {
    // Reconnect if needed
    if (!isConnected) {
      const connected = await connectPrinter(printer.type, printer.address);
      if (!connected) return false;
    }

    // Send text with ESC/POS formatting
    const data = COMMANDS.INIT + receiptText + COMMANDS.FEED + COMMANDS.CUT;
    await mod.default.printText(data);
    return true;
  } catch (err: any) {
    console.warn("Print failed:", err?.message);
    usePrinterStore.getState().setConnected(false);
    return false;
  }
}

export async function printTestPage(): Promise<boolean> {
  const testReceipt = [
    "================================",
    "        PRINTER TEST PAGE       ",
    "================================",
    "",
    "If you can read this, your",
    "printer is working correctly!",
    "",
    `Date: ${new Date().toLocaleString()}`,
    `Platform: ${Platform.OS}`,
    "",
    "================================",
    "",
  ].join("\n");

  return printReceipt(testReceipt);
}
