import { Platform, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { usePrinterStore } from "../stores/printer-store";
import { buildQrBmpBase64 } from "./receipt-qr";
import { fetchLogoBase64 } from "./receipt-logo";
import {
  printersForRole,
  DEFAULT_PAPER_WIDTH,
  DEFAULT_QR_MODE,
  type PaperWidth,
  type PrinterRole,
  type QrMode,
  type RegisteredPrinter,
} from "./printer-registry";
import { receiptMarkupToEscPos, printerWidthType, escPosQrCode } from "./receipt-escpos";
import { planPrintJobs, jobsForRole } from "./print-queue";

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

// iOS getDeviceList only fires its callback when a printer is discovered — if
// none is in range the promise NEVER settles. connectPrinter can likewise fail
// to call back. Without timeouts a scan or reconnect hangs the UI forever.
const DISCOVERY_TIMEOUT_MS = 12_000;
const CONNECT_TIMEOUT_MS = 10_000;

// CoreBluetooth is a state machine. RNBLEPrinter.m's `init` calls
// scanPrintersWithCompletion the instant it is invoked, and the vendor source
// documents the defect itself: "API MISUSE: <CBCentralManager> can only accept
// this command while in the powered on state". A CBCentralManager takes
// roughly 0.5-2s to reach CBManagerStatePoweredOn after it is instantiated,
// and iOS SILENTLY DROPS any scan issued before then — no error, no callback,
// no devices. Scanning milliseconds after init therefore never finds anything
// on the first attempt after an app launch, which is why iOS "just kept
// loading" while Android (bonded-device list, no state machine) worked.
const IOS_BLE_WARMUP_MS = 2_000;

// Each attempt is a scan window. Because a dropped window produces no callback
// at all, a single long window is strictly worse than several short ones: the
// retry is what recovers the launch-race, not extra patience.
// Kept just above the native scan window (5s, see the patch to RNBLEPrinter.m)
// so a patched build's real answer always arrives before we time it out. Older
// installed builds carry the unpatched native module, which never answers on an
// empty scan — for those the retry is the only thing that recovers the race.
const IOS_SCAN_WINDOW_MS = 6_000;
const IOS_SCAN_ATTEMPTS = 3;

/** Android 12 (API 31) — where the Bluetooth permissions became runtime ones. */
const ANDROID_RUNTIME_BLUETOOTH_API = 31;

/** Why a scan ended, so callers can tell a dead radio from an empty room. */
export type ScanStatus = "ok" | "timeout" | "unavailable";

export interface DiscoveredPrinter {
  name: string;
  address: string;
}

export interface ScanResult {
  printers: DiscoveredPrinter[];
  status: ScanStatus;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reject `promise` with a descriptive error if it hasn't settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Returns true when running inside the Expo Go client (no native module access). */
function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function checkPrinterAvailable(): boolean {
  if (printerAvailable !== null) return printerAvailable;

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
 * Request the runtime permissions the printer list actually needs.
 *
 * Android 12+ (API 31+): BLUETOOTH_CONNECT is the one that matters —
 * getBondedDevices() and the RFCOMM connect both throw SecurityException
 * without it. BLUETOOTH_SCAN is asked for alongside it because the OS groups
 * the two in one dialog, but a merchant who grants only CONNECT can still see
 * and use every paired printer, so it must never block them.
 *
 * Android 11 and below: nothing to ask. BLUETOOTH and BLUETOOTH_ADMIN are
 * install-time permissions, and the native adapter enumerates BONDED devices
 * (BluetoothAdapter.getBondedDevices) rather than running a BLE scan — the
 * location permission a scan would require buys nothing here. Asking for it
 * was worse than pointless: ACCESS_FINE_LOCATION is declared in no manifest in
 * this app, so the request resolved denied WITHOUT showing a dialog and locked
 * every pre-Android-12 tablet out of adding a printer at all.
 *
 * iOS permissions are declared in Info.plist and prompted by the system.
 */
export async function requestBluetoothPermissions(): Promise<PrinterResult> {
  if (Platform.OS === "ios") {
    // iOS Bluetooth permissions are declared in Info.plist
    // (NSBluetoothAlwaysUsageDescription, NSBluetoothPeripheralUsageDescription)
    // and prompted automatically by the system when scanning starts.
    return { success: true };
  }

  if (Platform.OS === "android") {
    const apiLevel = Platform.Version;
    // Below API 31 the permissions are install-time and the adapter never
    // scans, so there is nothing to ask and nothing that can be refused.
    if (typeof apiLevel !== "number" || apiLevel < ANDROID_RUNTIME_BLUETOOTH_API) {
      return { success: true };
    }

    try {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      const connectGranted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

      if (!connectGranted) {
        return {
          success: false,
          error:
            "Allow Bluetooth for SmartMenu in Settings > Apps > SmartMenu > Permissions, then scan again.",
        };
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

/** Normalise the native device dictionaries into our own shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDiscoveredPrinters(devices: any[] | null | undefined): DiscoveredPrinter[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (devices ?? []).map((d: any) => ({
    name: d.device_name || d.name || "Unknown Printer",
    address: d.inner_mac_address || d.address || d.macAddress,
  }));
}

export async function discoverBluetoothPrinters(): Promise<ScanResult> {
  const mod = getPrinterModule();
  // A pod missing from the build must never be reported as "no printers in
  // range" — that sends the merchant to check the printer instead of the app.
  if (!mod) return { printers: [], status: "unavailable" };

  try {
    await withTimeout(mod.BLEPrinter.init(), CONNECT_TIMEOUT_MS, "Bluetooth init");
  } catch (err: unknown) {
    console.warn("Bluetooth init failed:", err instanceof Error ? err.message : err);
    return { printers: [], status: "timeout" };
  }

  // Android resolves getDeviceList straight from the bonded-device list, so it
  // needs neither the warm-up nor the retries and must not be slowed down.
  if (Platform.OS !== "ios") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const devices = await withTimeout<any[]>(
        mod.BLEPrinter.getDeviceList(),
        DISCOVERY_TIMEOUT_MS,
        "Printer scan"
      );
      return { printers: toDiscoveredPrinters(devices), status: "ok" };
    } catch (err: unknown) {
      console.warn("Bluetooth discovery failed:", err instanceof Error ? err.message : err);
      return { printers: [], status: "timeout" };
    }
  }

  // Give CBCentralManager time to reach the powered-on state before the first
  // scan, otherwise iOS discards it without telling us.
  await delay(IOS_BLE_WARMUP_MS);

  for (let attempt = 0; attempt < IOS_SCAN_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const devices = await withTimeout<any[]>(
        mod.BLEPrinter.getDeviceList(),
        IOS_SCAN_WINDOW_MS,
        "Printer scan"
      );
      // The native side answered. An empty answer is a real answer: Bluetooth
      // is alive and there is genuinely nothing paired/in range.
      return { printers: toDiscoveredPrinters(devices), status: "ok" };
    } catch (err: unknown) {
      // No callback within the window — the scan was dropped or the radio was
      // not up yet. Open a fresh window rather than giving up.
      console.warn(
        `Bluetooth scan window ${attempt + 1}/${IOS_SCAN_ATTEMPTS} produced no callback:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return { printers: [], status: "timeout" };
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
      await withTimeout(mod.BLEPrinter.init(), CONNECT_TIMEOUT_MS, "Bluetooth init");
      try {
        await withTimeout(mod.BLEPrinter.connectPrinter(address), CONNECT_TIMEOUT_MS, "Printer connection");
      } catch {
        // iOS keeps its connect candidates only in memory: after an app
        // relaunch a saved printer is unknown to the native side until a scan
        // re-finds it. Rescan once, then retry the connection.
        await withTimeout(mod.BLEPrinter.getDeviceList(), DISCOVERY_TIMEOUT_MS, "Printer scan");
        await withTimeout(mod.BLEPrinter.connectPrinter(address), CONNECT_TIMEOUT_MS, "Printer connection");
      }
    } else {
      const [ip, port] = address.split(":");
      await withTimeout(mod.NetPrinter.init(), CONNECT_TIMEOUT_MS, "Network printer init");
      await withTimeout(
        mod.NetPrinter.connectPrinter(ip, parseInt(port || "9100", 10)),
        CONNECT_TIMEOUT_MS,
        "Printer connection"
      );
    }
    usePrinterStore.getState().setConnectedAddress(address);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("Printer connection failed:", message);
    usePrinterStore.getState().setConnectedAddress(null);
    return { success: false, error: describePrintFailure(message) || "Connection failed" };
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
  usePrinterStore.getState().setConnectedAddress(null);
}

/**
 * Wrap the library's fire-and-forget printBill in a real Promise.
 * The library's printText/printBill returns void and only delivers errors via
 * the onError callback — without this wrapper, failures are silent and
 * `await` resolves immediately on success/failure alike.
 */
/**
 * How long a piece of a receipt is given to report a failure before the next
 * piece is sent. The final piece keeps the full window so the print's result
 * reflects a late error; an earlier piece only needs long enough for a dead
 * connection to say so, and every extra second here is a pause on paper.
 */
const FINAL_PIECE_ERROR_WINDOW_MS = 1000;
const INNER_PIECE_ERROR_WINDOW_MS = 500;

function printBillAsync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  printerInstance: any,
  text: string,
  options: { cut: boolean } = { cut: true }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      printerInstance.printBill(text, {
        beep: false,
        cut: options.cut,
        // The Android driver feeds five blank lines after every call with
        // this on. Only the last piece of a receipt is allowed to: the
        // others used to open a hand's width of paper above the QR.
        tailingLine: options.cut,
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
    }, options.cut ? FINAL_PIECE_ERROR_WINDOW_MS : INNER_PIECE_ERROR_WINDOW_MS);
  });
}

/** One printable piece of a receipt; see renderReceiptSegments. */
export type PrintSegment =
  | { type: "text"; text: string }
  | { type: "qr"; data: string }
  | { type: "image"; url: string };

/**
 * Print width for the store logo, in dots. A 58mm head is 384 dots wide;
 * printing narrower leaves a margin and keeps the raster transfer quick.
 */
const LOGO_PRINT_WIDTH = 320;

/**
 * Give the printer's image buffer a moment to drain before more data follows.
 * printImageBase64 is fire-and-forget with no completion callback, and a text
 * write racing a half-transferred raster garbles both.
 */
const IMAGE_SETTLE_MS = 700;

/**
 * Send the segments to an already-connected printer instance. Text goes
 * through printBill, QR segments are rasterized (lib/receipt-qr) and sent
 * through printImageBase64. Exactly one cut happens, at the very end — never
 * between segments. A QR that cannot be built (or a printer whose firmware
 * ignores rasters) skips the image; the paper receipt itself always comes
 * first. Throws on print errors — the callers translate to PrinterResult.
 */
/**
 * What actually goes to the head: text pieces carry control bytes and are
 * merged when adjacent, so a receipt whose QR the printer draws itself is ONE
 * call — no per-piece error window, no image settle, no gap on the paper.
 */
type PrintPiece =
  | { type: "text"; bytes: string }
  | { type: "image"; url: string }
  | { type: "qrImage"; data: string };

export function planPrintPieces(segments: PrintSegment[], qrMode: QrMode): PrintPiece[] {
  const pieces: PrintPiece[] = [];
  const pushText = (bytes: string) => {
    const last = pieces[pieces.length - 1];
    if (last && last.type === "text") {
      pieces[pieces.length - 1] = { type: "text", bytes: last.bytes + "\n" + bytes };
    } else {
      pieces.push({ type: "text", bytes });
    }
  };

  for (const segment of segments) {
    if (segment.type === "text") {
      // Markup → control bytes here, never earlier: the tags are what the
      // Studio preview reads, the bytes are what the head reads.
      pushText(receiptMarkupToEscPos(segment.text));
    } else if (segment.type === "image") {
      pieces.push({ type: "image", url: segment.url });
    } else {
      const native = qrMode === "native" ? escPosQrCode(segment.data) : null;
      if (native) pushText(native);
      else pieces.push({ type: "qrImage", data: segment.data });
    }
  }
  return pieces;
}

async function runSegmentsOnInstance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
  segments: PrintSegment[],
  paperWidth: PaperWidth = DEFAULT_PAPER_WIDTH,
  qrMode: QrMode = DEFAULT_QR_MODE,
): Promise<void> {
  const pieces = planPrintPieces(segments, qrMode);
  const lastIndex = pieces.length - 1;
  let hasCut = false;
  // Told nothing, the iOS driver rasterizes into an 80mm-wide strip and
  // centres the image in it — a 58mm head then clips the right third of the
  // QR, which prints and never scans.
  const imageOptions = { printerWidthType: printerWidthType(paperWidth) };

  for (let i = 0; i < pieces.length; i++) {
    const segment = pieces[i]!;
    if (segment.type === "text") {
      const isFinal = i === lastIndex;
      await printBillAsync(instance, segment.bytes, { cut: isFinal });
      hasCut = isFinal;
      continue;
    }

    if (segment.type === "image") {
      // The store logo, downloaded as-is (PNG/JPEG decode on-device).
      const logo = await fetchLogoBase64(segment.url);
      if (!logo) continue; // unfetchable logo — the text receipt still prints
      instance.printImageBase64(logo, { imageWidth: LOGO_PRINT_WIDTH, ...imageOptions });
      await new Promise((resolve) => setTimeout(resolve, IMAGE_SETTLE_MS));
      continue;
    }

    const qr = buildQrBmpBase64(segment.data);
    if (!qr) continue; // unbuildable payload — the text receipt still prints
    instance.printImageBase64(qr.base64, { imageWidth: qr.widthPx, ...imageOptions });
    await new Promise((resolve) => setTimeout(resolve, IMAGE_SETTLE_MS));
  }

  if (!hasCut) {
    // The receipt ended on a QR (or a skipped one) — feed and cut after it.
    await printBillAsync(instance, "\n", { cut: true });
  }
}

// The native lib holds ONE active connection per transport and printBill is
// fire-and-forget, so all print jobs on this device funnel through a single
// promise-chain mutex: a receipt and a chit racing each other would interleave
// bytes on the wire and garble both.
let printQueueTail: Promise<unknown> = Promise.resolve();

function enqueuePrintJob<T>(job: () => Promise<T>): Promise<T> {
  const result = printQueueTail.then(job, job);
  printQueueTail = result.catch(() => undefined);
  return result;
}

/**
 * Segments, or a promise of them. A receipt that still needs a network hop
 * (the tracking URL, the logo) hands the promise in, and the queue brings the
 * connection up WHILE that hop is in flight instead of after it.
 */
export type SegmentSource = PrintSegment[] | Promise<PrintSegment[]>;

/**
 * Tear the native connection down so the next connect rebuilds the socket.
 *
 * Android's BluetoothSocket.isConnected() reports the LOCAL socket state only:
 * a printer that slept, was switched off, or drifted out of range leaves a
 * socket that still claims to be connected. The write then fails with "Broken
 * pipe" — and the native side reads that same claim as proof it need not
 * reconnect (BLEPrinterAdapter.selectDevice returns early, "do not need to
 * reconnect"), so a plain retry sends the next receipt down the very same dead
 * socket and fails identically. Closing first is what makes a retry a real
 * reconnection. The network adapter caches its stream the same way, so this is
 * not Bluetooth-specific.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resetNativeConnection(instance: any): Promise<void> {
  usePrinterStore.getState().setConnectedAddress(null);
  try {
    await instance.closeConn();
  } catch {
    // Already gone — closing a dead connection is the point, not a failure.
  }
}

/**
 * Native print errors reach the merchant verbatim in an Alert, and "failed to
 * print data: Broken pipe" tells a cashier nothing they can act on. Every one
 * of these means the same thing on the counter: the printer is not reachable
 * right now.
 */
const DROPPED_CONNECTION_PATTERNS = [
  /broken pipe/i,
  /connection is not built/i,
  /forgot to connectprinter/i,
  /socket (is )?closed/i,
  /outputstream is null/i,
];

const DROPPED_CONNECTION_MESSAGE =
  "The printer dropped the connection. Check it is switched on, has paper, and is in range, then print again.";

export function describePrintFailure(message: string): string {
  if (!message) return "Print failed";
  if (DROPPED_CONNECTION_PATTERNS.some((pattern) => pattern.test(message))) {
    return DROPPED_CONNECTION_MESSAGE;
  }
  if (/bluetooth (adapter )?is not enabled/i.test(message)) {
    return "Bluetooth is off. Turn it on, then print again.";
  }
  return message;
}

/**
 * Bring the connection to `printer` up if it is not the live one. Shared by
 * the print path and the launch-time warm-up.
 */
async function ensureConnected(printer: RegisteredPrinter): Promise<PrinterResult> {
  const [step] = planPrintJobs(
    [{ targetId: printer.id, segments: [] }],
    [printer],
    usePrinterStore.getState().connectedAddress,
  );
  if (!step?.needsConnect) return { success: true };
  // Let the previous printer's fire-and-forget transfer drain before the
  // connection moves to a different device.
  if (step.settleBeforeConnectMs > 0) await delay(step.settleBeforeConnectMs);
  return connectPrinter(printer.type, printer.address);
}

/**
 * Open the connection ahead of the first print. The native side forgets its
 * connection on every app launch, so without this the first receipt of the
 * day paid the whole Bluetooth handshake — on iOS, a rescan too — between the
 * tap and the paper. Runs through the queue like any job, so it can never
 * race a real print; a printer that is off simply fails quietly.
 */
export function warmUpPrinter(printer: RegisteredPrinter): Promise<PrinterResult> {
  return enqueuePrintJob(async () => {
    const mod = getPrinterModule();
    if (!mod) return { success: false, error: NOT_AVAILABLE_MSG };
    return ensureConnected(printer);
  });
}

/**
 * The one printer worth keeping warm: the native lib holds a single live
 * connection, and the cashier receipt is the paper a customer stands waiting
 * for. Falls back to the first saved printer on a kitchen-only device.
 */
export function pickWarmUpTarget(
  printers: readonly RegisteredPrinter[],
): RegisteredPrinter | undefined {
  return printersForRole(printers, "cashier")[0] ?? printers[0];
}

/**
 * Print segments on one specific saved printer, through the device-wide print
 * queue. Connects (or switches the connection) only when the target differs
 * from the currently connected printer; a failed print drops the connection
 * and retries once — connectPrinter already carries the iOS rescan fallback.
 */
export function printToPrinter(
  printer: RegisteredPrinter,
  source: SegmentSource,
): Promise<PrinterResult> {
  return enqueuePrintJob(async () => {
    const mod = getPrinterModule();
    if (!mod) return { success: false, error: NOT_AVAILABLE_MSG };

    const instance = printer.type === "bluetooth" ? mod.BLEPrinter : mod.NetPrinter;

    // The receipt keeps building even if the connection fails below; its
    // rejection must land somewhere, or it surfaces as an unhandled error.
    const building = Promise.resolve(source);
    building.catch(() => undefined);

    // Connect first, THEN wait for the receipt: the handshake and the
    // receipt's own network hops overlap instead of queueing behind each other.
    const connected = await ensureConnected(printer);
    if (!connected.success) return connected;

    let segments: PrintSegment[];
    try {
      segments = await building;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message || "Could not build the receipt" };
    }

    try {
      await runSegmentsOnInstance(instance, segments, printer.paperWidth, printer.qrMode);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("Print failed, reconnecting for one retry:", message);
      // Drop the native socket BEFORE reconnecting — see resetNativeConnection.
      // Without this the reconnect is a no-op and the retry repeats the failure.
      await resetNativeConnection(instance);

      const reconnected = await connectPrinter(printer.type, printer.address);
      if (!reconnected.success) {
        return { success: false, error: describePrintFailure(message) };
      }
      try {
        await runSegmentsOnInstance(instance, segments, printer.paperWidth, printer.qrMode);
        return { success: true };
      } catch (retryErr: unknown) {
        const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.warn("Print retry failed:", retryMessage);
        await resetNativeConnection(instance);
        return { success: false, error: describePrintFailure(retryMessage) };
      }
    }
  });
}

export interface RolePrintResult {
  results: { printerId: string; printerName: string; result: PrinterResult }[];
  anySuccess: boolean;
}

/**
 * Print for a role: the kitchen chit fans out to EVERY kitchen-role printer,
 * the cashier receipt goes to the first cashier-role printer only (see
 * jobsForRole). Runs sequentially through the queue, collects per-printer
 * results, and never throws — one dead printer cannot block the others.
 */
export async function printForRole(
  role: PrinterRole,
  source: SegmentSource,
): Promise<RolePrintResult> {
  const { printers } = usePrinterStore.getState();
  // The planner only routes; every job shares the one source.
  const jobs = jobsForRole(printers, role, []);
  const byId = new Map(printers.map((p) => [p.id, p]));

  const results: RolePrintResult["results"] = [];
  for (const job of jobs) {
    const printer = byId.get(job.targetId);
    if (!printer) continue;
    const result = await printToPrinter(printer, source);
    results.push({ printerId: printer.id, printerName: printer.name, result });
  }

  return { results, anySuccess: results.some((r) => r.result.success) };
}

/**
 * Legacy entry point: print on "the" printer. Routes to the first
 * cashier-role printer, falling back to the first saved printer so a
 * kitchen-only device can still test-print and reprint.
 */
export async function printReceiptSegments(
  segments: SegmentSource
): Promise<PrinterResult> {
  const { printers } = usePrinterStore.getState();
  const target = pickWarmUpTarget(printers);
  if (!target) return { success: false, error: "No printer configured." };
  return printToPrinter(target, segments);
}

export async function printReceipt(receiptText: string): Promise<PrinterResult> {
  return printReceiptSegments([{ type: "text", text: receiptText }]);
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
