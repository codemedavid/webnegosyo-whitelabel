/**
 * The Add-expense sheet's decisions, without the sheet (plan §5.1).
 *
 * Amount first on our own keypad (`keypad.ts`), then a category, then Save.
 * Everything that decides whether Save is allowed, what its button says, and
 * what gets written lives here so it is tested without a renderer — the sheet
 * only draws it.
 *
 * Two modes:
 * - `book`: the owner's "+ Expense". Paid from Cash on hand / GCash / Maya /
 *   Bank / Card / Owner's pocket; any recent date.
 * - `drawer`: "Pay an expense" from an open shift. The source is that drawer
 *   (locked), the date is today, and the amount can't be more than the drawer
 *   should hold — the same rule and words as every other cash move
 *   (`validateCashMove`).
 */

import { validateCashMove } from "../cash-drawers";
import { EMPTY_KEYPAD, formatPeso, keypadCents, keypadFromCents, type KeypadState } from "./keypad";
import { addDays } from "./manila-date";
import type { RepeatSuggestion } from "./repeat-chips";
import type { DrawerExpenseDraft, ExpenseCategory, ExpenseDraft, PaidFrom } from "./types";

export const NOTE_MAX = 200;
export const PAID_TO_MAX = 80;
/** Date chips the phone offers; older rows are back-office work on the web. */
export const DATE_CHOICE_DAYS = 7;

export type AddExpenseMode =
  | { kind: "book" }
  | {
      kind: "drawer";
      shiftId: string;
      drawerName: string;
      /** What the drawer should hold now, in centavos; null = unknown (never blocks). */
      availableCents: number | null;
    };

export interface AddExpenseForm {
  keypad: KeypadState;
  categoryId: string | null;
  paidFrom: Exclude<PaidFrom, "drawer">;
  note: string;
  paidToName: string;
  /** `YYYY-MM-DD`, Manila. */
  spentOn: string;
  /** "Did this go into your stock count?" — null until answered. */
  isStockPurchase: boolean | null;
}

export function emptyForm(today: string, paidFrom: Exclude<PaidFrom, "drawer"> = "cash"): AddExpenseForm {
  return {
    keypad: EMPTY_KEYPAD,
    categoryId: null,
    paidFrom,
    note: "",
    paidToName: "",
    spentOn: today,
    isStockPurchase: null,
  };
}

/** What the person keeps between entries in a batch: where the money comes from, and the day. */
export function nextEntryForm(previous: AddExpenseForm): AddExpenseForm {
  return { ...emptyForm(previous.spentOn, previous.paidFrom) };
}

/** One tap on "↻ Ice ₱120": fills the category AND the amount. */
export function applyRepeat(form: AddExpenseForm, suggestion: RepeatSuggestion): AddExpenseForm {
  return { ...form, keypad: keypadFromCents(suggestion.amountCents), categoryId: suggestion.categoryId, isStockPurchase: null };
}

export function selectCategory(form: AddExpenseForm, categoryId: string): AddExpenseForm {
  if (form.categoryId === categoryId) return form;
  return { ...form, categoryId, isStockPurchase: null };
}

/** The stock question shows only for ingredient buys in a store whose stock is counted (plan §2.2). */
export function asksStockQuestion(category: ExpenseCategory | null, tracksStock: boolean): boolean {
  return tracksStock && category?.group === "ingredients";
}

export function saveLabel(cents: number, verb = "Save"): string {
  return cents > 0 ? `${verb} ${formatPeso(cents)}` : verb;
}

export type FormVerdict =
  | { ok: true }
  | { ok: false; field: "amount" | "category" | "note" | "stock" | "date"; reason: string };

export interface FormContext {
  mode: AddExpenseMode;
  category: ExpenseCategory | null;
  tracksStock: boolean;
  today: string;
}

/** Whether Save can run, and if not, the one thing to fix — in the order the sheet asks for them. */
export function checkForm(form: AddExpenseForm, ctx: FormContext): FormVerdict {
  const cents = keypadCents(form.keypad);
  if (cents <= 0) return { ok: false, field: "amount", reason: "Type the amount first." };
  if (!ctx.category) return { ok: false, field: "category", reason: "Pick what it was for." };
  if (ctx.category.needsNote && !form.note.trim()) {
    return { ok: false, field: "note", reason: "Add a note for this category." };
  }
  if (form.note.trim().length > NOTE_MAX) {
    return { ok: false, field: "note", reason: `Keep the note under ${NOTE_MAX} characters.` };
  }
  if (asksStockQuestion(ctx.category, ctx.tracksStock) && form.isStockPurchase === null) {
    return { ok: false, field: "stock", reason: "Did this go into your stock count? Tap Yes or No." };
  }
  if (ctx.mode.kind === "drawer") {
    const verdict = validateCashMove(
      { kind: "pay_out", amount: cents / 100, reason: form.note.trim() || ctx.category.name },
      ctx.mode.availableCents === null ? null : ctx.mode.availableCents / 100,
    );
    if (!verdict.ok) return { ok: false, field: "amount", reason: verdict.reason };
    return { ok: true };
  }
  if (form.spentOn > ctx.today || form.spentOn < addDays(ctx.today, -400)) {
    return { ok: false, field: "date", reason: "Pick a day from the last 400 days." };
  }
  return { ok: true };
}

/** Save is enabled once there is an amount and a category; the rest is said when tapped. */
export function canTapSave(form: AddExpenseForm): boolean {
  return keypadCents(form.keypad) > 0 && form.categoryId !== null;
}

function trimmedOrNull(text: string, max: number): string | null {
  const trimmed = text.trim().slice(0, max);
  return trimmed ? trimmed : null;
}

export function toBookDraft(
  form: AddExpenseForm,
  input: { clientRequestId: string; outletId: string | null; tracksStock: boolean; category: ExpenseCategory },
): ExpenseDraft {
  return {
    amountCents: keypadCents(form.keypad),
    categoryId: input.category.id,
    spentOn: form.spentOn,
    paidFrom: form.paidFrom,
    outletId: input.outletId,
    note: trimmedOrNull(form.note, NOTE_MAX),
    paidToName: trimmedOrNull(form.paidToName, PAID_TO_MAX),
    isStockPurchase: asksStockQuestion(input.category, input.tracksStock) && form.isStockPurchase === true,
    clientRequestId: input.clientRequestId,
  };
}

export function toDrawerDraft(
  form: AddExpenseForm,
  input: { clientRequestId: string; shiftId: string; category: ExpenseCategory },
): DrawerExpenseDraft {
  return {
    shiftId: input.shiftId,
    amountCents: keypadCents(form.keypad),
    categoryId: input.category.id,
    note: trimmedOrNull(form.note, NOTE_MAX),
    paidToName: trimmedOrNull(form.paidToName, PAID_TO_MAX),
    clientRequestId: input.clientRequestId,
  };
}

/** The date chips: today first, then the previous days. */
export function dateChoices(today: string, days: number = DATE_CHOICE_DAYS): string[] {
  return Array.from({ length: days }, (_, index) => addDays(today, -index));
}

/** "Saved · LPG ₱1,250" — the snackbar after a save. */
export function savedMessage(categoryName: string, cents: number, isQueued: boolean): string {
  const short = categoryName.replace(/\s*\(.*\)\s*$/, "");
  return `${isQueued ? "Saved on this phone" : "Saved"} · ${short} ${formatPeso(cents)}`;
}

/** Which categories the sheet offers: everything spendable, or only the "not an expense" kinds. */
export function categoriesForScope(
  categories: readonly ExpenseCategory[],
  scope: "spend" | "take_out",
): ExpenseCategory[] {
  return categories.filter((category) =>
    scope === "take_out" ? category.group === "not_expense" : category.group !== "not_expense",
  );
}
