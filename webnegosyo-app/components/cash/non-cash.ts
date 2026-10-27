/**
 * The GCash & cards check at the end of a shift (06 §4.3 step 2).
 *
 * Rows come from `preview_shift_close.nonCashByMethod` (what the store's
 * records say each method took). The cashier answers each: Matches, Different
 * (with what their GCash app / card batch shows), or leaves the step to the
 * owner. Nothing here invents a figure: an unchecked row declares nothing.
 * Every edit returns new arrays; nothing is mutated.
 */
import type { RemittanceNonCashRow } from "../../lib/cash-slips/remittance-slip";

/** One row of `preview_shift_close.nonCashByMethod`. */
export interface NonCashMethod {
  key: string;
  label: string;
  cents: number;
  count: number;
}

/** `pending` = not answered yet; `unchecked` = left to the owner. */
export type NonCashAnswerCheck = "pending" | "matches" | "different" | "unchecked";

export interface NonCashAnswer {
  key: string;
  label: string;
  expectedCents: number;
  count: number;
  check: NonCashAnswerCheck;
  /** What the cashier sees instead (Different only). */
  declaredCents: number | null;
  note: string;
}

/** One payment, for "Show references". */
export interface NonCashReference {
  at: string;
  ref: string | null;
  cents: number;
}

/** One element of close_shift's p_non_cash (07 §4.3 `closing_non_cash`, plus the answer). */
export interface CloseNonCashRow {
  key: string;
  method: string;
  expectedCents: number;
  slipCount: number;
  check: "matches" | "different" | "unchecked";
  declaredCents: number | null;
  note: string | null;
}

export function initialNonCashAnswers(methods: readonly NonCashMethod[]): NonCashAnswer[] {
  return methods.map((m) => ({ key: m.key, label: m.label, expectedCents: m.cents, count: m.count, check: "pending", declaredCents: null, note: "" }));
}

function update(answers: readonly NonCashAnswer[], key: string, change: Partial<NonCashAnswer>): NonCashAnswer[] {
  return answers.map((answer) => (answer.key === key ? { ...answer, ...change } : answer));
}

export function setNonCashCheck(answers: readonly NonCashAnswer[], key: string, check: NonCashAnswerCheck): NonCashAnswer[] {
  return update(answers, key, check === "different" ? { check } : { check, declaredCents: null });
}

export function setNonCashDeclared(answers: readonly NonCashAnswer[], key: string, cents: number | null): NonCashAnswer[] {
  return update(answers, key, { declaredCents: cents });
}

export function setNonCashNote(answers: readonly NonCashAnswer[], key: string, note: string): NonCashAnswer[] {
  return update(answers, key, { note });
}

/** "All match" or "I'll leave this to the owner". */
export function markAllNonCash(answers: readonly NonCashAnswer[], check: "matches" | "unchecked"): NonCashAnswer[] {
  return answers.map((answer) => ({ ...answer, check, declaredCents: null }));
}

/** Every row answered; a Different has its amount. No rows = nothing to check. */
export function isNonCashComplete(answers: readonly NonCashAnswer[]): boolean {
  return answers.every((a) => a.check !== "pending" && (a.check !== "different" || a.declaredCents !== null));
}

function settledCheck(check: NonCashAnswerCheck): CloseNonCashRow["check"] {
  return check === "pending" ? "unchecked" : check;
}

/** close_shift's p_non_cash. Matches declares the record; unchecked declares nothing. */
export function toCloseNonCash(answers: readonly NonCashAnswer[]): CloseNonCashRow[] {
  return answers.map((a) => {
    const check = settledCheck(a.check);
    const declaredCents = check === "matches" ? a.expectedCents : check === "different" ? a.declaredCents : null;
    const note = a.note.trim();
    return { key: a.key, method: a.label, expectedCents: a.expectedCents, slipCount: a.count, check, declaredCents, note: note || null };
  });
}

/** The remittance slip's GCASH & CARDS rows. */
export function toSlipNonCash(answers: readonly NonCashAnswer[]): RemittanceNonCashRow[] {
  return answers.map((a) => ({
    label: a.label,
    count: a.count,
    cents: a.expectedCents,
    check: settledCheck(a.check),
    declaredCents: a.check === "different" ? a.declaredCents : null,
  }));
}
