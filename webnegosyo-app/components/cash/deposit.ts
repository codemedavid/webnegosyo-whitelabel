/**
 * The day's deposit (06 §4.5 step 4) and how it reaches
 * `record_day_deposit(p_close_id, p_cents, p_to, p_ref, p_proof_url)` (W3.1).
 *
 * The record holds ONE amount and where it went, so the three choices map:
 * - Bank deposit → the amount, the bank/account the owner names.
 * - Kept in safe → the amount, "Safe".
 * - Split → the BANK part, "BDO; ₱4,850 kept in safe" (the rest stays as cash).
 * `deposit_to` / `deposit_ref` are at most 80 characters (07 §5.2).
 */
import { formatCents } from "../../lib/expenses/expense-format";

export type DepositMode = "bank" | "safe" | "split";

export const DEPOSIT_TEXT_MAX = 80;
export const SAFE_LABEL = "Safe";
export const OFFLINE_LINE = "Recording a deposit needs a connection.";

export interface DepositDraft {
  mode: DepositMode;
  cents: number | null;
  bankName: string;
  reference: string;
  cashToDepositCents: number;
}

export interface DayDeposit {
  cents: number;
  to: string;
  ref: string | null;
}

export type DepositCheck = { ok: true; deposit: DayDeposit } | { ok: false; message: string };

/** "₱150 less than cash to deposit." — null when it matches. */
export function depositGapLine(cashToDepositCents: number, cents: number | null): string | null {
  if (cents === null || cents === cashToDepositCents) return null;
  const gap = formatCents(Math.abs(cents - cashToDepositCents), { compact: true });
  return `${gap} ${cents < cashToDepositCents ? "less" : "more"} than cash to deposit.`;
}

function clip(text: string): string {
  return text.trim().slice(0, DEPOSIT_TEXT_MAX);
}

function bankTarget(draft: DepositDraft, cents: number): DepositCheck {
  const bank = clip(draft.bankName);
  if (!bank) return { ok: false, message: "Which bank or account did it go to?" };
  const ref = clip(draft.reference) || null;
  if (draft.mode === "bank") return { ok: true, deposit: { cents, to: bank, ref } };
  if (cents <= 0 || cents >= draft.cashToDepositCents) {
    return { ok: false, message: `For a split, type the part that went to the bank (less than ${formatCents(draft.cashToDepositCents, { compact: true })}).` };
  }
  const kept = formatCents(draft.cashToDepositCents - cents, { compact: true });
  return { ok: true, deposit: { cents, to: clip(`${bank}; ${kept} kept in safe`), ref } };
}

export function buildDeposit(draft: DepositDraft): DepositCheck {
  if (draft.cents === null) return { ok: false, message: "Type the amount." };
  if (draft.mode === "safe") return { ok: true, deposit: { cents: draft.cents, to: SAFE_LABEL, ref: clip(draft.reference) || null } };
  return bankTarget(draft, draft.cents);
}
