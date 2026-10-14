/**
 * One bill paid with more than one method: ₱120 by GCash and the rest in cash.
 *
 * Each line becomes its own payment, recorded the way a single collection is
 * (`settleBillTenders`), so the ledger — and every report that reads it —
 * knows how much came in by each method. Pure; the collect sheet only draws
 * the lines and hands the verdict on.
 *
 * A blank amount on the LAST line means "the rest", so the common split is one
 * typed figure. A blank cash received means the customer handed over exactly
 * the cash part.
 */
import type { CollectMethodOption } from "../order-collect";
import { computeChange } from "../pos-cash";
import { fromCents, toCents } from "./money";

export interface TenderLine {
  key: string;
  methodId: string | null;
  /** As typed. Blank on the last line takes whatever the others leave. */
  amount: string;
  /** Cash only: what was handed over. Blank means exact. */
  cash: string;
  /** Non-cash only, e.g. a GCash reference. */
  reference: string;
}

export interface SplitPayment {
  amount: number;
  methodId: string;
  methodName: string;
  reference?: string;
  cashTendered?: number;
  changeDue?: number;
}

export type SplitTenderVerdict =
  | { ok: true; payments: SplitPayment[] }
  | { ok: false; error: string };

export interface SplitCoverage {
  coveredCents: number;
  /** Still owed after these lines. */
  leftCents: number;
  /** By how much the lines exceed the balance. */
  overCents: number;
}

export const MIN_TENDER_LINES = 2;
/** A till rarely sees more; past it the sheet stops fitting a phone. */
export const MAX_TENDER_LINES = 4;

function blankLine(key: string, methodId: string | null): TenderLine {
  return { key, methodId, amount: "", cash: "", reference: "" };
}

function nextKey(lines: readonly TenderLine[]): string {
  const used = lines.map((l) => Number(l.key.replace(/^t/, ""))).filter(Number.isFinite);
  return `t${(used.length > 0 ? Math.max(...used) : 0) + 1}`;
}

/**
 * The opening split: a non-cash method first (the one already picked, if it
 * is one), then cash for the rest — the way a customer usually splits.
 */
export function initialTenderLines(
  methods: readonly CollectMethodOption[],
  selectedId: string | null,
): TenderLine[] {
  const selected = methods.find((m) => m.id === selectedId);
  const first = (selected && !selected.isCash ? selected : methods.find((m) => !m.isCash)) ?? methods[0];
  const second =
    methods.find((m) => m.isCash && m.id !== first?.id) ?? methods.find((m) => m.id !== first?.id) ?? first;
  return [blankLine("t1", first?.id ?? null), blankLine("t2", second?.id ?? null)];
}

export function addTenderLine(lines: readonly TenderLine[]): readonly TenderLine[] {
  if (lines.length >= MAX_TENDER_LINES) return lines;
  return [...lines, blankLine(nextKey(lines), null)];
}

export function removeTenderLine(lines: readonly TenderLine[], key: string): readonly TenderLine[] {
  if (lines.length <= MIN_TENDER_LINES) return lines;
  return lines.filter((l) => l.key !== key);
}

export function updateTenderLine(
  lines: readonly TenderLine[],
  key: string,
  change: Partial<Omit<TenderLine, "key">>,
): readonly TenderLine[] {
  return lines.map((l) => (l.key === key ? { ...l, ...change } : l));
}

function typedCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? toCents(value) : null;
}

function isRestLine(lines: readonly TenderLine[], index: number): boolean {
  return index === lines.length - 1 && lines[index].amount.trim() === "";
}

/** Each line's centavos, `null` where nothing usable was typed. */
export function resolveTenderCents(lines: readonly TenderLine[], balanceDueCents: number): (number | null)[] {
  const typed = lines.map((l) => typedCents(l.amount));
  const others = typed.reduce<number>((sum, cents, index) => (isRestLine(lines, index) ? sum : sum + (cents ?? 0)), 0);
  return typed.map((cents, index) => (isRestLine(lines, index) ? balanceDueCents - others : cents));
}

export function splitTenderCoverage(lines: readonly TenderLine[], balanceDue: number): SplitCoverage {
  const balanceCents = toCents(balanceDue);
  const coveredCents = resolveTenderCents(lines, balanceCents).reduce<number>(
    (sum, cents) => sum + Math.max(0, cents ?? 0),
    0,
  );
  return {
    coveredCents,
    leftCents: Math.max(0, balanceCents - coveredCents),
    overCents: Math.max(0, coveredCents - balanceCents),
  };
}

function pesos(cents: number): string {
  return `₱${fromCents(cents).toFixed(2)}`;
}

function cashPart(line: TenderLine, amountCents: number): { cashTendered: number; changeDue: number } | string {
  const raw = line.cash.trim();
  if (raw === "") return { cashTendered: fromCents(amountCents), changeDue: 0 };
  const cash = Number(raw);
  if (!Number.isFinite(cash) || cash <= 0) return "Enter the cash received as a number, like 500.";
  const change = computeChange(fromCents(amountCents), cash);
  if (!change.isSufficient) {
    return `${pesos(toCents(cash))} cash does not cover the ${pesos(amountCents)} cash part.`;
  }
  return { cashTendered: fromCents(toCents(cash)), changeDue: change.changeDue };
}

function lineAmountError(
  lines: readonly TenderLine[],
  index: number,
  cents: number | null,
  name: string,
  names: readonly string[],
): string | null {
  if (isRestLine(lines, index)) {
    if (cents !== null && cents > 0) return null;
    const others = names.filter((_, i) => i !== index).join(" and ");
    return `${others} already ${index > 1 ? "cover" : "covers"} the bill. Remove the ${name} line, or lower the other amounts.`;
  }
  if (lines[index].amount.trim() === "") return `Enter how much was paid by ${name}.`;
  if (cents === null) return `Enter the ${name} amount as a number, like 120.`;
  if (cents <= 0) return `Enter more than zero for ${name}.`;
  return null;
}

/**
 * The payments these lines describe, or the first thing wrong with them, in
 * the order a cashier fixes things: the method, each amount, the total, then
 * the cash handed over.
 */
export function validateSplitTender(
  lines: readonly TenderLine[],
  methods: readonly CollectMethodOption[],
  balanceDue: number,
): SplitTenderVerdict {
  if (lines.length < MIN_TENDER_LINES) {
    return { ok: false, error: "Add a second payment method, or pay with one method." };
  }

  const chosen = lines.map((l) => methods.find((m) => m.id === l.methodId) ?? null);
  const missing = chosen.findIndex((m) => m === null);
  if (missing >= 0) return { ok: false, error: `Choose how payment ${missing + 1} was paid.` };
  const picked = chosen as CollectMethodOption[];
  const names = picked.map((m) => m.name);

  const balanceCents = toCents(balanceDue);
  const cents = resolveTenderCents(lines, balanceCents);
  for (const [index, amount] of cents.entries()) {
    const error = lineAmountError(lines, index, amount, names[index], names);
    if (error) return { ok: false, error };
  }

  const amounts = cents as number[];
  const totalCents = amounts.reduce((sum, c) => sum + c, 0);
  if (totalCents > balanceCents) {
    return { ok: false, error: `These add up to ${pesos(totalCents)}, but only ${pesos(balanceCents)} is owed.` };
  }

  const payments: SplitPayment[] = [];
  for (const [index, method] of picked.entries()) {
    const line = lines[index];
    const base = { amount: fromCents(amounts[index]), methodId: method.id, methodName: method.name };
    if (method.isCash) {
      const cash = cashPart(line, amounts[index]);
      if (typeof cash === "string") return { ok: false, error: cash };
      payments.push({ ...base, ...cash });
      continue;
    }
    const reference = line.reference.trim();
    payments.push(reference === "" ? base : { ...base, reference });
  }
  return { ok: true, payments };
}
