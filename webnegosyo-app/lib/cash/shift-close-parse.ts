/**
 * Parsers for the shift's money RPC replies (CONTRACTS W2.2), kept apart from
 * the calls so pure modules (the End shift rules, components) can read a
 * reply without pulling in the network client. A reply without the promised
 * shape throws; the caller treats that as a failure, never ₱0. Pure.
 */

// ── Parsing ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function asRow(value: unknown, what: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${what}: not an object`);
  return value as Row;
}

function cents(row: Row, key: string): number {
  const value = row[key];
  const n = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new Error(`${key}: not whole centavos (${String(value)})`);
  return n;
}

function centsOrNull(row: Row, key: string): number | null {
  return row[key] === null || row[key] === undefined ? null : cents(row, key);
}

function textOrNull(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${key}: not text`);
  return value;
}

function bool(row: Row, key: string): boolean {
  if (typeof row[key] !== "boolean") throw new Error(`${key}: not a boolean`);
  return row[key] as boolean;
}

function oneOf<T extends string>(row: Row, key: string, values: readonly T[]): T {
  const value = row[key];
  if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
  throw new Error(`${key}: unknown (${String(value)})`);
}

export type ExpectedSource = "server" | "device" | "none";
const SOURCES: readonly ExpectedSource[] = ["server", "device", "none"];

export interface NonCashMethod {
  key: string;
  label: string;
  cents: number;
  count: number;
}

export interface ExpectedLine {
  key: string;
  label: string;
  cents: number;
}

export interface ShiftClosePreview {
  source: ExpectedSource;
  /** Blind and not yet counted: expected is withheld. */
  hidden: boolean;
  expectedCents: number | null;
  breakdown: ExpectedLine[] | null;
  nonCashByMethod: NonCashMethod[] | null;
  floatCents: number;
  isZeroBalance: boolean;
  countAttempts: number;
}

function listOrNull<T>(value: unknown, what: string, read: (row: Row) => T): T[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new Error(`${what}: not a list`);
  return value.map((entry) => read(asRow(entry, what)));
}

export function parseClosePreview(data: unknown): ShiftClosePreview {
  const row = asRow(data, "preview");
  return {
    source: oneOf(row, "source", SOURCES),
    hidden: bool(row, "hidden"),
    expectedCents: centsOrNull(row, "expectedCents"),
    // `breakdown` is the server's own line list; anything else is ignored rather than guessed.
    breakdown: Array.isArray(row.breakdown)
      ? listOrNull(row.breakdown, "breakdown", (r) => ({ key: String(r.key ?? ""), label: String(r.label ?? ""), cents: cents(r, "cents") }))
      : null,
    nonCashByMethod: listOrNull(row.nonCashByMethod, "nonCashByMethod", (r) => ({
      key: String(r.key ?? ""),
      label: String(r.label ?? ""),
      cents: cents(r, "cents"),
      count: cents(r, "count"),
    })),
    floatCents: cents(row, "floatCents"),
    isZeroBalance: bool(row, "isZeroBalance"),
    countAttempts: cents(row, "countAttempts"),
  };
}

export interface ShiftCountResult {
  attempt: 1 | 2;
  countedCents: number;
  expectedCents: number | null;
  differenceCents: number | null;
  source: ExpectedSource;
  reasonRequired: boolean;
}

export function parseCountResult(data: unknown): ShiftCountResult {
  const row = asRow(data, "count");
  const attempt = cents(row, "attempt");
  if (attempt !== 1 && attempt !== 2) throw new Error(`attempt: ${attempt}`);
  return {
    attempt,
    countedCents: cents(row, "countedCents"),
    expectedCents: centsOrNull(row, "expectedCents"),
    differenceCents: centsOrNull(row, "differenceCents"),
    source: oneOf(row, "source", SOURCES),
    reasonRequired: bool(row, "reasonRequired"),
  };
}

export interface ShiftCloseResult {
  closedAt: string;
  countedCents: number;
  expectedCents: number | null;
  differenceCents: number | null;
  remittanceId: string | null;
  handedOverCents: number;
}

export function parseCloseResult(data: unknown): ShiftCloseResult {
  const row = asRow(data, "close");
  const closedAt = textOrNull(row, "closedAt");
  if (!closedAt) throw new Error("closedAt: missing");
  return {
    closedAt,
    countedCents: cents(row, "countedCents"),
    expectedCents: centsOrNull(row, "expectedCents"),
    differenceCents: centsOrNull(row, "differenceCents"),
    remittanceId: textOrNull(row, "remittanceId"),
    handedOverCents: cents(row, "handedOverCents"),
  };
}

export interface ShiftHandover {
  previousShiftId: string;
  leftCents: number;
  staffName: string | null;
  closedAt: string | null;
}

export interface OpenShiftResult {
  state: "opened" | "joined" | "stale";
  /** The shift row, camelCase; the Drawer re-reads its own after opening. */
  shiftId: string | null;
  handover: ShiftHandover | null;
}

export function parseOpenResult(data: unknown): OpenShiftResult {
  const row = asRow(data, "open");
  const shift = row.shift && typeof row.shift === "object" ? (row.shift as Row) : null;
  const handover = row.handover ? asRow(row.handover, "handover") : null;
  return {
    state: oneOf(row, "state", ["opened", "joined", "stale"] as const),
    shiftId: shift ? textOrNull(shift, "id") : null,
    handover: handover
      ? {
          previousShiftId: textOrNull(handover, "previousShiftId") ?? "",
          leftCents: cents(handover, "leftCents"),
          staffName: textOrNull(handover, "staffName"),
          closedAt: textOrNull(handover, "closedAt"),
        }
      : null,
  };
}

export interface PickupResult {
  movementId: string;
  remittanceId: string | null;
}

export function parsePickupResult(data: unknown): PickupResult {
  const row = asRow(data, "pickup");
  const movementId = textOrNull(row, "movementId");
  if (!movementId) throw new Error("movementId: missing");
  return { movementId, remittanceId: textOrNull(row, "remittanceId") };
}

