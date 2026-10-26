/**
 * The store's cash rules (CONTRACTS §2 `tenant_cash_settings`, §5) and the
 * business-day cutoff writer.
 *
 * No row = the defaults below, which are exactly how a store behaved before
 * these rules existed: no blind count, counting bills optional, a reason above
 * ₱20, remittances optional, selling without a shift allowed. Reads go straight
 * to the table under RLS (store members may read); writes go through the
 * definer RPC `save_cash_settings` (`cash_manage`), which refuses unknown keys.
 *
 * The app ships no zod, so the parser below is hand-rolled with the same
 * contract: unknown shapes throw, missing fields take their default, nothing is
 * guessed. The client is injected (`CashDb`) so tests never open a connection;
 * `cash-client.ts`-style wiring lives in the screens' hooks.
 */

import { withDeadline } from "../offline/deadline";
import { isNetworkFailure } from "../offline/network-error";

const REQUEST_MS = 15_000;

/** Ask for a reason above this difference, at most ₱1,000. */
export const VARIANCE_REASON_MAX_CENTS = 100_000;
/** How far the reason threshold moves per tap of the stepper (₱10). */
export const VARIANCE_REASON_STEP_CENTS = 1_000;
/** Latest business-day cutoff: 11:45 AM (CONTRACTS §1.1, 0..705 in 15-minute steps). */
export const MAX_CUTOFF_MINUTES = 705;
export const CUTOFF_STEP_MINUTES = 15;
const OVERDUE_GRACE_RANGE = { min: 30, max: 1440 } as const;
/** ₱1,000,000 float: a ceiling only a typo reaches. */
const MAX_FLOAT_CENTS = 100_000_000;

export const REMITTANCE_MODES = ["off", "optional", "required"] as const;
export type RemittanceMode = (typeof REMITTANCE_MODES)[number];

export interface CashSettings {
  /** Hide expected cash from cashiers until they have counted. */
  blindClose: boolean;
  /** Count bills and coins at the end of a shift instead of typing one total. */
  requireDenominations: boolean;
  /** A reason is required when |counted − expected| is above this. */
  varianceReasonFromCents: number;
  remittanceMode: RemittanceMode;
  /** The first sale without a shift opens Start shift. */
  requireShiftToSell: boolean;
  overdueGraceMinutes: number;
  defaultFloatCents: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
}

/** The fields a person changes; the rest is stamped by the server. */
export type CashRuleKey =
  | "blindClose"
  | "requireDenominations"
  | "varianceReasonFromCents"
  | "remittanceMode"
  | "requireShiftToSell"
  | "overdueGraceMinutes"
  | "defaultFloatCents";

export type CashSettingsPatch = Partial<Pick<CashSettings, CashRuleKey>>;

export const DEFAULT_CASH_SETTINGS: Readonly<CashSettings> = Object.freeze({
  blindClose: false,
  requireDenominations: false,
  varianceReasonFromCents: 2000,
  remittanceMode: "optional",
  requireShiftToSell: false,
  overdueGraceMinutes: 240,
  defaultFloatCents: null,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
});

export const CASH_SETTINGS_COPY = {
  notReady: "Shift & remit rules need a server update first. Ask WebNegosyo support.",
  notSaved: "Your change was not saved. You may not have access, or it changed elsewhere. Pull down and try again.",
  noAccess: "Only the owner or someone with Cash & day close can change these rules.",
  cutoffNoAccess: "Only the owner or someone with Settings can change when the business day ends.",
  offline: "No connection. Connect to save.",
  badRules: "The cash rules on the server could not be read.",
} as const;

export interface DbError {
  code?: string;
  message?: string;
}

interface DbAnswer {
  data: unknown;
  error: DbError | null;
}

/**
 * The slice of supabase-js the cash services use. Builders are typed loosely on
 * purpose (the app's client is untyped until the types are regenerated after
 * the migrations are applied); every row is parsed below.
 */
export interface CashDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbAnswer>;
}

// ── Errors ────────────────────────────────────────────────────────────────

/** Postgres "relation/function does not exist": the migration is not applied yet. */
export function isNotDeployed(error: DbError): boolean {
  return error.code === "42P01" || error.code === "42883" || error.code === "PGRST202" || error.code === "PGRST205";
}

export function describeCashError(error: DbError, fallback: string, noAccess: string = CASH_SETTINGS_COPY.noAccess): Error {
  if (isNetworkFailure(error)) return new Error(CASH_SETTINGS_COPY.offline);
  if (isNotDeployed(error)) return new Error(CASH_SETTINGS_COPY.notReady);
  if (error.code === "42501") return new Error(noAccess);
  return new Error(error.message ? `${fallback} (${error.message})` : fallback);
}

// ── Parsing ───────────────────────────────────────────────────────────────

type FieldReader<T> = (value: unknown) => T | undefined;

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

const readBool: FieldReader<boolean> = (value) => (typeof value === "boolean" ? value : undefined);
const readCents =
  (max: number): FieldReader<number> =>
  (value) => {
    const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    return isInt(n) && n >= 0 && n <= max ? n : undefined;
  };
const readMode: FieldReader<RemittanceMode> = (value) =>
  REMITTANCE_MODES.includes(value as RemittanceMode) ? (value as RemittanceMode) : undefined;
const readGrace: FieldReader<number> = (value) =>
  isInt(value) && value >= OVERDUE_GRACE_RANGE.min && value <= OVERDUE_GRACE_RANGE.max ? value : undefined;
const readText: FieldReader<string> = (value) => (typeof value === "string" ? value : undefined);

interface FieldSpec {
  key: keyof CashSettings;
  column: string;
  read: FieldReader<unknown>;
  nullable: boolean;
}

const FIELDS: readonly FieldSpec[] = [
  { key: "blindClose", column: "blind_close", read: readBool, nullable: false },
  { key: "requireDenominations", column: "require_denominations", read: readBool, nullable: false },
  {
    key: "varianceReasonFromCents",
    column: "variance_reason_from_cents",
    read: readCents(VARIANCE_REASON_MAX_CENTS),
    nullable: false,
  },
  { key: "remittanceMode", column: "remittance_mode", read: readMode, nullable: false },
  { key: "requireShiftToSell", column: "require_shift_to_sell", read: readBool, nullable: false },
  { key: "overdueGraceMinutes", column: "overdue_grace_minutes", read: readGrace, nullable: false },
  { key: "defaultFloatCents", column: "default_float_cents", read: readCents(MAX_FLOAT_CENTS), nullable: true },
  { key: "updatedAt", column: "updated_at", read: readText, nullable: true },
  { key: "updatedBy", column: "updated_by", read: readText, nullable: true },
  { key: "updatedByName", column: "updated_by_name", read: readText, nullable: true },
];

const RULE_KEYS: readonly CashRuleKey[] = [
  "blindClose",
  "requireDenominations",
  "varianceReasonFromCents",
  "remittanceMode",
  "requireShiftToSell",
  "overdueGraceMinutes",
  "defaultFloatCents",
];

/**
 * A row (snake_case) or the RPC's answer (camelCase) → CashSettings.
 * THROWS on a value of the wrong kind: a rule the app cannot read must not be
 * quietly replaced by its default.
 */
export function parseCashSettings(raw: unknown): CashSettings {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(CASH_SETTINGS_COPY.badRules);
  }
  const source = raw as Record<string, unknown>;
  const entries = FIELDS.map((field) => {
    const value = field.column in source ? source[field.column] : source[field.key];
    if (value === undefined) return [field.key, DEFAULT_CASH_SETTINGS[field.key]] as const;
    if (value === null && field.nullable) return [field.key, null] as const;
    const parsed = field.read(value);
    if (parsed === undefined) throw new Error(`${CASH_SETTINGS_COPY.badRules} (${field.column})`);
    return [field.key, parsed] as const;
  });
  return Object.fromEntries(entries) as unknown as CashSettings;
}

export type PatchVerdict = { ok: true; value: CashSettingsPatch } | { ok: false; reason: string };

/** Only the rule fields, each within its bounds. */
export function validateCashSettingsPatch(patch: CashSettingsPatch): PatchVerdict {
  const kept = RULE_KEYS.filter((key) => patch[key] !== undefined);
  if (kept.length === 0) return { ok: false, reason: "Nothing to save." };
  for (const key of kept) {
    const field = FIELDS.find((f) => f.key === key) as FieldSpec;
    const value = patch[key];
    if (value === null && field.nullable) continue;
    if (field.read(value) === undefined) return { ok: false, reason: `That value for ${field.column} is not allowed.` };
  }
  return { ok: true, value: Object.fromEntries(kept.map((key) => [key, patch[key]])) as CashSettingsPatch };
}

function toColumns(patch: CashSettingsPatch): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [FIELDS.find((f) => f.key === key)?.column ?? key, value]),
  );
}

// ── Reads & writes ────────────────────────────────────────────────────────

const SETTINGS_COLUMNS = FIELDS.map((field) => field.column).join(", ");

/** The store's rules; the defaults when it has never saved any. */
export async function fetchCashSettings(db: CashDb, tenantId: string): Promise<CashSettings> {
  const { data, error } = (await withDeadline(
    Promise.resolve(db.from("tenant_cash_settings").select(SETTINGS_COLUMNS).eq("tenant_id", tenantId).maybeSingle()),
    REQUEST_MS,
  )) as DbAnswer;
  if (error) throw describeCashError(error, "The cash rules could not be read.");
  if (data === null || data === undefined) return { ...DEFAULT_CASH_SETTINGS };
  return parseCashSettings(data);
}

/**
 * Save the changed rules. The RPC answers with the saved row; an empty answer
 * is a refusal (a definer check or RLS that said no without raising).
 */
export async function saveCashSettings(db: CashDb, tenantId: string, patch: CashSettingsPatch): Promise<CashSettings> {
  const verdict = validateCashSettingsPatch(patch);
  if (!verdict.ok) throw new Error(verdict.reason);
  const { data, error } = await withDeadline(
    Promise.resolve(db.rpc("save_cash_settings", { p_tenant: tenantId, p_settings: toColumns(verdict.value) })),
    REQUEST_MS,
  );
  if (error) throw describeCashError(error, "The cash rules could not be saved.");
  if (data === null || data === undefined) throw new Error(CASH_SETTINGS_COPY.notSaved);
  return parseCashSettings(data);
}

export function isValidCutoffMinutes(minutes: number): boolean {
  return isInt(minutes) && minutes >= 0 && minutes <= MAX_CUTOFF_MINUTES && minutes % CUTOFF_STEP_MINUTES === 0;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Change when the business day ends. Returns the first business day
 * ('YYYY-MM-DD') that starts at the new cutoff — always a day that has not
 * begun, so past days keep their dates (07 §2.2).
 */
export async function setBusinessDayCutoff(db: CashDb, tenantId: string, cutoffMinutes: number): Promise<string> {
  if (!isValidCutoffMinutes(cutoffMinutes)) {
    throw new Error("Pick a time between 12:00 AM and 11:45 AM, in 15-minute steps.");
  }
  const { data, error } = await withDeadline(
    Promise.resolve(db.rpc("set_business_day_cutoff", { p_tenant: tenantId, p_cutoff_minutes: cutoffMinutes })),
    REQUEST_MS,
  );
  if (error) throw describeCashError(error, "The business day could not be changed.", CASH_SETTINGS_COPY.cutoffNoAccess);
  const day = typeof data === "string" ? data.slice(0, 10) : null;
  if (!day || !DAY_KEY.test(day)) throw new Error(CASH_SETTINGS_COPY.notSaved);
  return day;
}
