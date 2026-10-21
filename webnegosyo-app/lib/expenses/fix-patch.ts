/**
 * What a Fix changes, in the database's names (contract §5 `replace_expense`).
 * Only what actually changed travels, and a drawer row never sends its
 * amount, date or source (`drawer_locked`). Pure.
 */

import type { ExpensePatch } from "./expense-service";
import { parsePesoInput } from "./keypad";
import type { Expense, PaidFrom } from "./types";

export interface FixEdit {
  categoryId: string;
  note: string;
  amountText: string;
  paidFrom: Exclude<PaidFrom, "drawer"> | null;
}

/** What changed, in database names; `null` = nothing did. */
export function buildFixPatch(
  original: Pick<Expense, "categoryId" | "note" | "amountCents" | "paidFrom">,
  edit: FixEdit,
): { patch: ExpensePatch | null; error: string | null } {
  const patch: ExpensePatch = {};
  if (edit.categoryId !== original.categoryId) patch.category_id = edit.categoryId;
  const note = edit.note.trim();
  if (note !== (original.note ?? "").trim()) patch.note = note || null;
  if (original.paidFrom !== "drawer") {
    const cents = parsePesoInput(edit.amountText);
    if (cents === null || cents <= 0) return { patch: null, error: "Enter the amount as pesos, like 1,250 or 80.50." };
    if (cents !== original.amountCents) patch.amount_cents = cents;
    if (edit.paidFrom && edit.paidFrom !== original.paidFrom) patch.paid_from = edit.paidFrom;
  }
  return { patch: Object.keys(patch).length > 0 ? patch : null, error: null };
}

