import { Platform, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { usePrinterStore } from "../stores/printer-store";

// ESC/POS commands for text formatting.
// Note: init/feed/cut are handled by the library's printBill (EPToolkit) so we
// don't need to inject those bytes manually into the receipt text.
const ESC = "\x1B";
const GS = "\x1D";
const COMMANDS = {
  ALIGN_CENTER: `${ESC}a1`,
  ALIGN_LEFT: `${ESC}a0`,
  BOLD_ON: `${ESC}E1`,
  BOLD_OFF: `${ESC}E0`,
  DOUBLE_HEIGHT: `${GS}!\x10`,
  NORMAL_SIZE: `${GS}!\x00`,
};

/** Structured result for printer operations — callers handle UI */
export interface PrinterResult {
  success: boolean;
  error?: string;
}

// Native module availability flag
// @haroldtran/react-native-thermal-printer requires a development build with native modules.
// In Expo Go, the native modules won't exist and require() triggers a fatal
// TurboModule Invariant Violation that bypasses try/catch. Guard with appOwnership check first.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let printerModule: { BLEPrinter: any; NetPrinter: any } | null = null;
let printerAvailable: boolean | null = null;

const NOT_AVAILABLE_MSG = "Printer requires a development build. Printing is not available in Expo Go.";

/** Returns true when running inside the Expo Go client (no native module access). */
function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function checkPrinterAvailable(): boolean {
  if (printerAvailable !== null) return printerAvailable;

  if (Platform.OS === "ios") {
    printerAvailable = false;
    return false;
  }

  // In Expo Go, requiring native modules triggers a fatal TurboModule crash.
  // Skip the require entirely — printer features are only available in dev/prod builds.
  if (isExpoGo()) {
    printerAvailable = false;
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@haroldtran/react-native-thermal-printer");
    if (!mod || (!mod.BLEPrinter && !mod.NetPrinter)) {
      printerAvailable = false;
      return false;
    }
    printerModule = mod;
    printerAvailable = true;
    return true;
  } catch {
    printerAvailable = false;
    return false;
  }
}

function getPrinterModule() {
  if (!checkPrinterAvailable()) return null;
  return printerModule;
}

/**
 * Request Bluetooth permissions required for printer scanning/connecting.
 * Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT.
 * iOS permissions are handled via Info.plist entries by the library.
 * Returns true if permissions granted, false otherwise.
 */
export async function requestBluetoothPermissions(): Promise<PrinterResult> {
  if (Platform.OS === "ios") {
    // iOS Bluetooth permissions are declared in Info.plist
    // (NSBluetoothAlwaysUsageDescription, NSBluetoothPeripheralUsageDescription)
    // and prompted automatically by the system when scanning starts.
    return { success: true };
  }

  if (Platform.OS === "android") {
    try {
      // Android 12+ (API 31+) requires runtime Bluetooth permissions
      const apiLevel = Platform.Version;
      if (typeof apiLevel === "number" && apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        const scanGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
        const connectGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

        if (!scanGranted || !connectGranted) {
          return {
            success: false,
            error: "Bluetooth permissions are required to scan for printers. Please grant Bluetooth permissions in Settings.",
          };
        }
      } else {
        // Android < 12 requires location permission for Bluetooth scanning
        const locationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "Location permission is required to scan for Bluetooth printers.",
            buttonPositive: "OK",
          }
        );
        if (locationGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          return {
            success: false,
            error: "Location permission is required for Bluetooth scanning on this Android version.",
          };
        }
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: `Failed to request Bluetooth permissions: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  }

  return { success: true };
}

export async function discoverBluetoothPrinters(): Promise<Array<{ name: string; address: string }>> {
  const mod = getPrinterModule();
  if (!mod) return [];

  try {
    await mod.BLEPrinter.init();
    const devices = await mod.BLEPrinter.getDeviceList();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (devices ?? []).map((d: any) => ({
      name: d.device_name || d.name || "Unknown Printer",
      address: d.inner_mac_address || d.address || d.macAddress,
    }));
  } catch (err: unknown) {
    console.warn("Bluetooth discovery failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Connect to a printer. Returns a structured result instead of calling Alert.alert,
 * so callers can present the error in whatever UI they prefer.
 */
export async function connectPrinter(type: "bluetooth" | "network", address: string): Promise<PrinterResult> {
  const mod = getPrinterModule();
  if (!mod) {
    return { success: false, error: NOT_AVAILABLE_MSG };
  }

  try {
    if (type === "bluetooth") {
      await mod.BLEPrinter.init();
      await mod.BLEPrinter.connectPrinter(address);
    } else {
      const [ip, port] = address.split(":");
      await mod.NetPrinter.init();
      await mod.NetPrinter.connectPrinter(ip, parseInt(port || "9100", 10));
    }
    usePrinterStore.getState().setConnected(true);
    return { success: true };
  } catch (err: unknown) {
    console.warn("Printer connection failed:", err instanceof Error ? err.message : err);
    usePrinterStore.getState().setConnected(false);
    return { success: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function disconnectPrinter(): Promise<void> {
  const mod = getPrinterModule();
  if (!mod) return;
  try {
    // closeConn works for both BLE and Net printers
    await mod.BLEPrinter.closeConn();
  } catch {
    // Ignore disconnect errors — may already be disconnected
  }
  try {
    await mod.NetPrinter.closeConn();
  } catch {
    // Ignore disconnect errors
  }
  usePrinterStore.getState().setConnected(false);
}

/**
 * Wrap the library's fire-and-forget printBill in a real Promise.
 * The library's printText/printBill returns void and only delivers errors via
 * the onError callback — without this wrapper, failures are silent and
 * `await` resolves immediately on success/failure alike.
 */
function printBillAsync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  printerInstance: any,
  text: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      printerInstance.printBill(text, {
        beep: false,
        cut: true,
        tailingLine: true,
        encoding: "UTF8",
        onError: (err: Error) => {
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      });
    } catch (err: unknown) {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    // printBill is fire-and-forget; if no onError fires within a short window
    // we treat it as success. The library doesn't expose a success callback.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, 1500);
  });
}

export async function printReceipt(receiptText: string): Promise<PrinterResult> {
  const mod = getPrinterModule();
  if (!mod) return { success: false, error: NOT_AVAILABLE_MSG };

  const { printer, isConnected } = usePrinterStore.getState();
  if (!printer) return { success: false, error: "No printer configured." };

  // Reconnect if needed
  if (!isConnected) {
    const result = await connectPrinter(printer.type, printer.address);
    if (!result.success) return result;
  }

  try {
    const instance = printer.type === "bluetooth" ? mod.BLEPrinter : mod.NetPrinter;
    await printBillAsync(instance, receiptText);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("Print failed:", message);
    usePrinterStore.getState().setConnected(false);
    return { success: false, error: message || "Print failed" };
  }
}

export async function printTestPage(): Promise<PrinterResult> {
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

export function isPrinterSupported(): boolean {
  return checkPrinterAvailable();
}
