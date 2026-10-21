/**
 * The Change, Void and "Give these a category" sheets' decisions, pure:
 * reason chips, what a Change sends, and the category a pay-out looks like.
 */

import type { ExpensePatch } from "./expense-service";
import { buildFixPatch, type FixEdit } from "./fix-patch";
import { suggestCategoryForReason } from "./sort-suggest";
import type { Expense, ExpenseCategory } from "./types";

export const VOID_REASONS = ["Recorded twice", "Wrong amount", "Not ours", "Wrong category"] as const;
export const CHANGE_REASONS = ["Wrong category", "Wrong amount", "Paid a different way", "Typo"] as const;

export type ReasonCheck = { reason: string; error: null } | { reason: null; error: string };

export function checkVoidReason(text: string): ReasonCheck {
  const reason = text.trim();
  return reason ? { reason, error: null } : { reason: null, error: "Say why — a short reason is enough." };
}

export type ChangeCheck = { patch: ExpensePatch; reason: string; error: null } | { patch: null; reason: null; error: string };

function refuse(error: string): ChangeCheck {
  return { patch: null, reason: null, error };
}

/**
 * What a Change sends (void + a corrected copy, `replace_expense`). A drawer
 * row keeps its amount, date and drawer — `buildFixPatch` never sends them.
 */
export function checkChange(
  original: Pick<Expense, "categoryId" | "note" | "amountCents" | "paidFrom">,
  edit: FixEdit,
  reasonText: string,
  category: Pick<ExpenseCategory, "needsNote"> | undefined,
): ChangeCheck {
  const { patch, error } = buildFixPatch(original, edit);
  if (error) return refuse(error);
  if (!patch) return refuse("Nothing changed yet.");
  if (category?.needsNote && !edit.note.trim()) return refuse("Add a note for this category.");
  const reason = reasonText.trim();
  if (!reason) return refuse("Say why you are changing it.");
  return { patch, reason, error: null };
}

/** "Ice (Yelo)" → "Ice": the seed name without its bracket, for chips and buttons. */
export function shortName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "");
}

/** The category a pay-out's typed reason points at, unless it is already the chosen one. */
export function payoutSuggestion(
  reason: string,
  categories: readonly ExpenseCategory[],
  chosenId: string | null,
): ExpenseCategory | null {
  const guess = suggestCategoryForReason(reason, categories);
  if (!guess || guess.categoryId === chosenId) return null;
  return categories.find((category) => category.id === guess.categoryId) ?? null;
}
