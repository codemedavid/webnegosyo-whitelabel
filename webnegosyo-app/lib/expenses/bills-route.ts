/**
 * The "Bills to pay" route and its links (bills-contract §5).
 *
 * `/(main)/expense-bills` (never `bill`, which is the table check) takes:
 * - `new=1` — open the add-bill sheet, optionally pre-filled with
 *   `category=<categoryId>`, `amount=<cents>`, `day=<1..31|last>`, `name=<text>`
 *   ("Make it a bill?", "Repeat this", the Undo bar's "Repeat");
 * - `bill=<billId>` — open that bill's sheet ("Paid for: Rent · October").
 *
 * Links come from other screens and from other agents' code, so every value
 * is checked here and a bad one is dropped, never trusted.
 */

import type { DayOfMonth } from "./bill-schedule";
import { BILL_AMOUNT_MAX_CENTS, BILL_NAME_MAX } from "./bill-schedule";

export const BILLS_PATH = "/(main)/expense-bills";

export interface BillPrefill {
  categoryId: string | null;
  amountCents: number | null;
  day: DayOfMonth | null;
  name: string | null;
}

export const NO_PREFILL: BillPrefill = Object.freeze({ categoryId: null, amountCents: null, day: null, name: null });

export type BillsRouteIntent =
  | { kind: "new"; prefill: BillPrefill }
  | { kind: "bill"; billId: string }
  | null;

type RawParam = string | string[] | undefined;

export interface BillsRouteParams {
  new?: RawParam;
  bill?: RawParam;
  category?: RawParam;
  amount?: RawParam;
  day?: RawParam;
  name?: RawParam;
}

/** The params a link sets, cleared once handled so a re-render never re-opens the sheet. */
export const CLEARED_BILL_PARAMS = Object.freeze({
  new: undefined,
  bill: undefined,
  category: undefined,
  amount: undefined,
  day: undefined,
  name: undefined,
});

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const LAST_DAY_WORD = "last";
const MAX_DAY = 31;

function single(value: RawParam): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function idOf(value: RawParam): string | null {
  const raw = single(value);
  return raw !== null && ID_PATTERN.test(raw) ? raw : null;
}

function centsOf(value: RawParam): number | null {
  const raw = single(value);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const cents = Number(raw);
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= BILL_AMOUNT_MAX_CENTS ? cents : null;
}

/** `1..31` or `last`; anything else is dropped. */
export function parseDayParam(value: RawParam): DayOfMonth | null {
  const raw = single(value);
  if (raw === null) return null;
  if (raw.toLowerCase() === LAST_DAY_WORD) return "last";
  if (!/^\d{1,2}$/.test(raw)) return null;
  const day = Number(raw);
  return day >= 1 && day <= MAX_DAY ? day : null;
}

function nameOf(value: RawParam): string | null {
  const raw = single(value);
  return raw === null ? null : raw.slice(0, BILL_NAME_MAX);
}

function isOn(value: RawParam): boolean {
  const raw = single(value);
  return raw === "1" || raw === "true";
}

/** What a link asks the screen to open; null when it asks for nothing usable. */
export function parseBillsParams(params: BillsRouteParams): BillsRouteIntent {
  const billId = idOf(params.bill);
  if (billId !== null) return { kind: "bill", billId };
  if (!isOn(params.new)) return null;
  return {
    kind: "new",
    prefill: {
      categoryId: idOf(params.category),
      amountCents: centsOf(params.amount),
      day: parseDayParam(params.day),
      name: nameOf(params.name),
    },
  };
}

/** Whether a link carried anything at all (so the screen clears it once). */
export function hasBillsParams(params: BillsRouteParams): boolean {
  return Object.values(params).some((value) => single(value) !== null);
}

/** `/(main)/expense-bills?new=1&category=…&amount=…&day=…&name=…` — unknown parts left out. */
export function newBillHref(prefill: Partial<BillPrefill> = {}): string {
  const parts = ["new=1"];
  if (prefill.categoryId) parts.push(`category=${encodeURIComponent(prefill.categoryId)}`);
  if (typeof prefill.amountCents === "number" && prefill.amountCents > 0) parts.push(`amount=${Math.round(prefill.amountCents)}`);
  if (prefill.day !== null && prefill.day !== undefined) parts.push(`day=${prefill.day}`);
  if (prefill.name) parts.push(`name=${encodeURIComponent(prefill.name.slice(0, BILL_NAME_MAX))}`);
  return `${BILLS_PATH}?${parts.join("&")}`;
}

/** `/(main)/expense-bills?bill=<id>` — opens that bill's sheet. */
export function billHref(billId: string): string {
  return `${BILLS_PATH}?bill=${encodeURIComponent(billId)}`;
}

export interface MakeBillTarget {
  categoryId: string;
  typicalDay: number;
  typicalCents: number;
  /** The bill's suggested name ("Kuryente"); null = the editor names it from the category. */
  name: string | null;
}

/**
 * A "Make it a bill?" Needs-you action (`{ kind: "make_bill", categoryId,
 * typicalDay, typicalCents }`), checked from `unknown` so this screen does not
 * depend on the Needs-you type having it yet.
 */
export function makeBillTarget(action: unknown): MakeBillTarget | null {
  if (typeof action !== "object" || action === null) return null;
  const record = action as Record<string, unknown>;
  if (record.kind !== "make_bill" || typeof record.categoryId !== "string" || record.categoryId === "") return null;
  const day = typeof record.typicalDay === "number" ? Math.round(record.typicalDay) : NaN;
  const cents = typeof record.typicalCents === "number" ? Math.round(record.typicalCents) : NaN;
  const name = typeof record.name === "string" && record.name.trim() !== "" ? record.name.trim().slice(0, BILL_NAME_MAX) : null;
  return {
    categoryId: record.categoryId,
    typicalDay: day >= 1 && day <= MAX_DAY ? day : 1,
    typicalCents: cents > 0 ? cents : 0,
    name,
  };
}

/** The link a "Make it a bill?" item opens. */
export function makeBillHref(target: MakeBillTarget): string {
  return newBillHref({
    categoryId: target.categoryId,
    amountCents: target.typicalCents > 0 ? target.typicalCents : null,
    day: target.typicalDay,
    name: target.name,
  });
}

/** "Repeat this" on an expense: same category and amount, due on the day it was spent. */
export function repeatExpenseHref(expense: { categoryId: string; amountCents: number; spentOn: string }): string {
  const day = Number(expense.spentOn.slice(8, 10));
  return newBillHref({
    categoryId: expense.categoryId,
    amountCents: expense.amountCents,
    day: day >= 1 && day <= MAX_DAY ? day : null,
  });
}
