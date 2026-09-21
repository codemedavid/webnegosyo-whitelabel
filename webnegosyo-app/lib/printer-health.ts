// What this device currently believes about each saved printer, and the copy
// the printer list shows for it.
//
// The list used to offer "Test" on every row, connected or not. On a printer
// that was switched off, out of range, or asleep, that tap ran the whole
// connect → write → "Broken pipe" path and came back as a modal error the
// cashier could do nothing with. Worse, it read as a promise: a button that
// says Test implies there is something to test against.
//
// A row now states what it knows — reached, never reached, or reached and
// then lost — and offers the action that matches. Test is only offered once a
// connection actually exists.

export type PrinterStatus = "unknown" | "connecting" | "ready" | "unreachable";

export interface PrinterHealth {
  status: PrinterStatus;
  /** Merchant-facing reason the last attempt failed. Only set on unreachable. */
  message?: string;
}

/** A printer nothing has been tried on yet this session. */
export const UNKNOWN_HEALTH: PrinterHealth = { status: "unknown" };

/** What is known about one printer. A printer with no entry has not been tried. */
export function healthFor(
  health: Record<string, PrinterHealth>,
  address: string,
): PrinterHealth {
  return health[address] ?? UNKNOWN_HEALTH;
}

/** The dot beside the printer's name. Amber is "was reachable, is not now". */
export type HealthTone = "on" | "warn" | "off";

export function healthTone(status: PrinterStatus): HealthTone {
  if (status === "ready") return "on";
  if (status === "unreachable") return "warn";
  return "off";
}

/** The label on the row's action button. */
export function healthActionLabel(status: PrinterStatus): string {
  switch (status) {
    case "ready":
      return "Test";
    case "unreachable":
      return "Reconnect";
    case "connecting":
      return "Connecting";
    default:
      return "Connect";
  }
}

/** Read out for screen readers, and what the row says it knows. */
export function healthSummary(status: PrinterStatus): string {
  switch (status) {
    case "ready":
      return "Connected";
    case "unreachable":
      return "Not reachable";
    case "connecting":
      return "Connecting";
    default:
      return "Not connected yet";
  }
}

const NOT_CONNECTED_NOTICE = "Not connected yet. Tap Connect before printing from this device.";

const DEFAULT_UNREACHABLE_NOTICE =
  "The printer did not answer. Switch it on, check paper and range, then tap Reconnect.";

/**
 * The line under the printer's name, or null when there is nothing to say.
 * A failure the print path already explained keeps its own wording — it is
 * more specific than anything this module could guess.
 */
export function healthNotice(health: PrinterHealth): string | null {
  if (health.status === "unreachable") return health.message ?? DEFAULT_UNREACHABLE_NOTICE;
  if (health.status === "unknown") return NOT_CONNECTED_NOTICE;
  return null;
}

/**
 * Whether the row offers "Scan for it". Only a Bluetooth printer can go out
 * of range, and only a failed one is worth hunting for — a network printer
 * lives at a fixed address, so rescanning tells the merchant nothing.
 */
export function canScanFor(
  printer: { type: "bluetooth" | "network" },
  status: PrinterStatus,
): boolean {
  return printer.type === "bluetooth" && status === "unreachable";
}

/**
 * Whether a tap on the row's action should print a test page. Everything else
 * — never tried, failed, mid-connect — has to get a connection first.
 */
export function shouldTestPrint(status: PrinterStatus): boolean {
  return status === "ready";
}
