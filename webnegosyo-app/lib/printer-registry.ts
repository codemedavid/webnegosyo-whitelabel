// The printer registry: pure list operations over the printers a device has
// saved. Each printer holds one or both roles — "cashier" (customer receipt)
// and "kitchen" (chit) — and print calls resolve their target through the
// role, never through a hardcoded "the printer". Persistence lives in
// stores/printer-store; nothing here touches AsyncStorage or natives.

export type PrinterRole = "cashier" | "kitchen";

export const PRINTER_ROLES: readonly PrinterRole[] = ["cashier", "kitchen"];

/**
 * Paper roll width in millimetres. The driver rasterizes images (the QR, the
 * logo) into a strip as wide as the head it is told about, and pads to 80mm
 * when told nothing — which clips the right third of a QR on a 58mm printer.
 * Text columns follow it too: 32 on 58mm, 48 on 80mm.
 */
export type PaperWidth = 58 | 80;

export const PAPER_WIDTHS: readonly PaperWidth[] = [58, 80];

/** The common counter printer; every saved printer without a width is one. */
export const DEFAULT_PAPER_WIDTH: PaperWidth = 58;

/**
 * How the tracking QR reaches the paper. `native` hands the printer a GS ( k
 * command and lets its firmware draw the code; `image` sends a raster, for
 * the rare head whose firmware does not know the command.
 */
export type QrMode = "native" | "image";

export const QR_MODES: readonly QrMode[] = ["native", "image"];

export const DEFAULT_QR_MODE: QrMode = "native";

export interface RegisteredPrinter {
  id: string;
  type: "bluetooth" | "network";
  name: string;
  /** MAC address for BT, "ip:port" for network. Unique per device list. */
  address: string;
  /** Non-empty — a printer no role can reach is unreachable by definition. */
  roles: readonly PrinterRole[];
  /** Absent on entries saved before paper widths existed — read as 58mm. */
  paperWidth?: PaperWidth;
  /** Absent on entries saved before the setting existed — read as native. */
  qrMode?: QrMode;
}

/** Deterministic id from caller-supplied time and randomness (testable). */
export function createPrinterId(nowMs: number, rand: number): string {
  return `p_${nowMs.toString(36)}_${Math.floor(rand * 36 ** 6).toString(36)}`;
}

/**
 * Add a printer. The address is the physical identity: re-adding a device the
 * merchant already saved replaces that entry in place instead of listing the
 * same printer twice.
 */
export function addPrinter(
  list: readonly RegisteredPrinter[],
  printer: RegisteredPrinter,
): RegisteredPrinter[] {
  const existingIndex = list.findIndex((p) => p.address === printer.address);
  if (existingIndex === -1) return [...list, printer];
  return list.map((p, i) => (i === existingIndex ? printer : p));
}

export function removePrinter(
  list: readonly RegisteredPrinter[],
  id: string,
): RegisteredPrinter[] {
  return list.filter((p) => p.id !== id);
}

/**
 * Patch a printer. An empty roles patch is ignored — stripping the last role
 * would leave a printer nothing can print to; the UI offers Remove for that.
 */
export function updatePrinter(
  list: readonly RegisteredPrinter[],
  id: string,
  patch: Partial<Omit<RegisteredPrinter, "id">>,
): RegisteredPrinter[] {
  return list.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p, ...patch };
    if (!next.roles || next.roles.length === 0) next.roles = p.roles;
    return next;
  });
}

export function printersForRole(
  list: readonly RegisteredPrinter[],
  role: PrinterRole,
): RegisteredPrinter[] {
  return list.filter((p) => p.roles.includes(role));
}

function isPrinterRole(value: unknown): value is PrinterRole {
  return (PRINTER_ROLES as readonly unknown[]).includes(value);
}

function toPaperWidth(value: unknown): PaperWidth {
  return (PAPER_WIDTHS as readonly unknown[]).includes(value)
    ? (value as PaperWidth)
    : DEFAULT_PAPER_WIDTH;
}

function toQrMode(value: unknown): QrMode {
  return (QR_MODES as readonly unknown[]).includes(value) ? (value as QrMode) : DEFAULT_QR_MODE;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRegisteredPrinter(raw: any): RegisteredPrinter | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.type !== "bluetooth" && raw.type !== "network") return null;
  if (typeof raw.address !== "string" || raw.address.length === 0) return null;
  const roles = Array.isArray(raw.roles) ? raw.roles.filter(isPrinterRole) : [];
  if (roles.length === 0) return null;
  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `p_${raw.address}`,
    type: raw.type,
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : "Printer",
    address: raw.address,
    roles,
    paperWidth: toPaperWidth(raw.paperWidth),
    qrMode: toQrMode(raw.qrMode),
  };
}

/**
 * Migrate the legacy single `printer_config` entry. The one printer used to
 * print BOTH the receipt and the kitchen chit, so it arrives holding both
 * roles — anything narrower silently breaks the KDS print button on upgrade.
 */
export function migrateLegacyPrinter(raw: string | null): RegisteredPrinter[] {
  if (!raw) return [];
  try {
    const legacy = JSON.parse(raw);
    const printer = toRegisteredPrinter({ ...legacy, roles: [...PRINTER_ROLES] });
    return printer ? [printer] : [];
  } catch {
    return [];
  }
}

/** Parse the stored list; corrupt storage reads as "no printers saved". */
export function parsePrinterList(raw: string | null): RegisteredPrinter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toRegisteredPrinter)
      .filter((p): p is RegisteredPrinter => p !== null);
  } catch {
    return [];
  }
}

/**
 * Default roles for a printer being added. The very first printer gets both —
 * parity with the migrated legacy printer, and what a single-printer store
 * actually wants. After that, suggest whichever role is still uncovered.
 */
export function suggestedRoles(list: readonly RegisteredPrinter[]): PrinterRole[] {
  const hasCashier = printersForRole(list, "cashier").length > 0;
  const hasKitchen = printersForRole(list, "kitchen").length > 0;
  if (!hasCashier && !hasKitchen) return ["cashier", "kitchen"];
  if (!hasKitchen) return ["kitchen"];
  if (!hasCashier) return ["cashier"];
  return ["cashier"];
}
