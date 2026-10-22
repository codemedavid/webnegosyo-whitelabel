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
 * - `drawer`: "Pay from the drawer" on an open shift. The source is that drawer
 *   (locked), the date is today, and the amount can't be more than the drawer
 *   should hold — the same rule and words as every other cash move
 *   (`validateCashMove`).
 */

import { validateCashMove } from "../cash-drawers";
import type { BillPayContext } from "./bills-screen";
import type { QueuedExpense } from "./expense-queue";
import { EMPTY_KEYPAD, MAX_AMOUNT_CENTS, formatPeso, keypadCents, keypadFromCents, type KeypadState } from "./keypad";
import { addDays } from "./manila-date";
import type { RepeatSuggestion } from "./repeat-chips";
import { suggestCategoryForReason } from "./sort-suggest";
import type { DrawerExpenseDraft, ExpenseCategory, ExpenseDraft, PaidFrom } from "./types";

export const NOTE_MAX = 200;
export const PAID_TO_MAX = 80;
/** How far back an expense may be dated: the validator and the calendar share it. */
export const MAX_DAYS_BACK = 400;
/** Date chips offered by default; the calendar reaches back to `MAX_DAYS_BACK`. */
export const DATE_CHOICE_DAYS = 7;

export type BookPaidFrom = Exclude<PaidFrom, "drawer">;
export type ExpenseSheetScope = "spend" | "take_out";

export type AddExpenseMode =
  | { kind: "book" }
  | {
      kind: "drawer";
      shiftId: string;
      drawerName: string;
      /** What the drawer should hold now, in centavos; null = unknown (never blocks). */
      availableCents: number | null;
      /** "Ben's shift" — shown after the drawer's name on the chip when given. */
      shiftLabel?: string | null;
    };

export interface AddExpenseForm {
  keypad: KeypadState;
  categoryId: string | null;
  paidFrom: BookPaidFrom;
  note: string;
  paidToName: string;
  /** `YYYY-MM-DD`, Manila. */
  spentOn: string;
  /** "Did this go into your stock count?" — null until answered. */
  isStockPurchase: boolean | null;
  /** Whether the category came from the note; a person's own pick is never replaced. */
  isCategoryFromNote: boolean;
}

export function emptyForm(today: string, paidFrom: BookPaidFrom = "cash"): AddExpenseForm {
  return {
    keypad: EMPTY_KEYPAD,
    categoryId: null,
    paidFrom,
    note: "",
    paidToName: "",
    spentOn: today,
    isStockPurchase: null,
    isCategoryFromNote: false,
  };
}

export interface OpeningValues {
  today: string;
  /** Kept from the last entry: where the money usually comes from. */
  paidFrom: BookPaidFrom;
  initialCategoryId?: string | null;
  initialAmountCents?: number;
  initialNote?: string;
  initialIsStockPurchase?: boolean;
  /** Paying a bill ("Mark paid"): its amount (fixed bills), category, source and payee come first. */
  bill?: BillPayContext | null;
}

function isUsableAmount(cents: number | undefined): cents is number {
  return typeof cents === "number" && Number.isInteger(cents) && cents > 0 && cents <= MAX_AMOUNT_CENTS;
}

/** The form a sheet opens with: what the caller already knows ("Record what you paid"), else empty. */
export function formForOpening(values: OpeningValues): AddExpenseForm {
  const { bill } = values;
  if (bill) {
    return {
      ...emptyForm(values.today, bill.paidFrom),
      keypad: isUsableAmount(bill.amountCents ?? undefined) ? keypadFromCents(bill.amountCents as number) : EMPTY_KEYPAD,
      categoryId: bill.categoryId,
      paidToName: (bill.paidToName ?? "").slice(0, PAID_TO_MAX),
    };
  }
  const empty = emptyForm(values.today, values.paidFrom);
  return {
    ...empty,
    keypad: isUsableAmount(values.initialAmountCents) ? keypadFromCents(values.initialAmountCents) : EMPTY_KEYPAD,
    categoryId: values.initialCategoryId ?? null,
    note: (values.initialNote ?? "").slice(0, NOTE_MAX),
    isStockPurchase: values.initialIsStockPurchase ?? null,
  };
}

/** What the person keeps between entries in a batch: where the money comes from, and the day. */
export function nextEntryForm(previous: AddExpenseForm): AddExpenseForm {
  return { ...emptyForm(previous.spentOn, previous.paidFrom) };
}

/** One tap on "↻ Ice ₱120": fills the category AND the amount. */
export function applyRepeat(form: AddExpenseForm, suggestion: RepeatSuggestion): AddExpenseForm {
  return {
    ...form,
    keypad: keypadFromCents(suggestion.amountCents),
    categoryId: suggestion.categoryId,
    isStockPurchase: null,
    isCategoryFromNote: false,
  };
}

export function selectCategory(form: AddExpenseForm, categoryId: string): AddExpenseForm {
  if (form.categoryId === categoryId) return form.isCategoryFromNote ? { ...form, isCategoryFromNote: false } : form;
  return { ...form, categoryId, isStockPurchase: null, isCategoryFromNote: false };
}

/**
 * Typing the note: "palengke" picks Ingredients, but only while the person has
 * not picked a category themselves, and only on a clear match among the
 * categories this sheet offers (`suggestCategoryForReason` confidence high).
 */
export function withNote(form: AddExpenseForm, note: string, offered: readonly ExpenseCategory[]): AddExpenseForm {
  const next = { ...form, note };
  const mayPick = form.categoryId === null || form.isCategoryFromNote;
  if (!mayPick) return next;
  const suggestion = suggestCategoryForReason(note, offered);
  if (suggestion?.confidence !== "high" || suggestion.categoryId === form.categoryId) return next;
  return { ...next, categoryId: suggestion.categoryId, isStockPurchase: null, isCategoryFromNote: true };
}

/** The stock question shows only for ingredient buys in a store whose stock is counted (plan §2.2). */
export function asksStockQuestion(category: ExpenseCategory | null, tracksStock: boolean): boolean {
  return tracksStock && category?.group === "ingredients";
}

export function saveLabel(cents: number, verb = "Save"): string {
  return cents > 0 ? `${verb} ${formatPeso(cents)}` : verb;
}

export function sheetTitle(mode: AddExpenseMode, scope: ExpenseSheetScope, bill?: BillPayContext | null): string {
  if (bill) return `Pay ${bill.name}`;
  if (scope === "take_out") return "Take out cash";
  return mode.kind === "drawer" ? "Pay from the drawer" : "New expense";
}

/** The one main button; it always repeats the amount ("Pay ₱150 from drawer"). */
export function primaryLabel(
  cents: number,
  mode: AddExpenseMode,
  scope: ExpenseSheetScope,
  hasCategory = true,
  bill?: BillPayContext | null,
): string {
  // The amount is in but the button is still off: say what's missing instead
  // of showing a grey "Save ₱22,222" that won't press.
  if (cents > 0 && !hasCategory) return "Choose a category";
  if (bill) return cents > 0 ? `Save ${formatPeso(cents)} · ${bill.name} paid` : `Type what you paid for ${bill.name}`;
  if (scope === "take_out") return saveLabel(cents, "Take out");
  if (mode.kind === "drawer") return cents > 0 ? `Pay ${formatPeso(cents)} from drawer` : "Pay from drawer";
  return saveLabel(cents);
}

/** "Front till · Ben's shift", "Cashier 1 drawer", or "Your drawer" for the till with no name. */
export function drawerChipLabel(mode: Extract<AddExpenseMode, { kind: "drawer" }>): string {
  const name = mode.drawerName.trim();
  const drawer = name === "" || name === "My" ? "Your drawer" : /\b(drawer|till)\b/i.test(name) ? name : `${name} drawer`;
  const shift = mode.shiftLabel?.trim();
  return shift ? `${drawer} · ${shift}` : drawer;
}

/** What the drawer should hold after this pay-out; null when unknown, nothing typed, or too much. */
export function drawerAfterCents(mode: AddExpenseMode, cents: number): number | null {
  if (mode.kind !== "drawer" || mode.availableCents === null || cents <= 0) return null;
  const after = mode.availableCents - cents;
  return after >= 0 ? after : null;
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
  if (form.spentOn > ctx.today || form.spentOn < oldestSpendDate(ctx.today)) {
    return { ok: false, field: "date", reason: `Pick a day from the last ${MAX_DAYS_BACK} days.` };
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
  input: { clientRequestId: string; outletId: string | null; tracksStock: boolean; category: ExpenseCategory; bill?: BillPayContext | null },
): ExpenseDraft {
  const { bill } = input;
  // Paying a bill links the expense to that due date (both or neither) and keeps the bill's supplier.
  const billLink = bill ? { billId: bill.billId, billDueOn: bill.dueOn, supplierId: bill.supplierId } : {};
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
    ...billLink,
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

/** The oldest day an expense may be dated (`checkForm` and the calendar's lower bound). */
export function oldestSpendDate(today: string): string {
  return addDays(today, -MAX_DAYS_BACK);
}

/** The date chips: today first, then the previous days — never older than the validator allows. */
export function dateChoices(today: string, days: number = DATE_CHOICE_DAYS): string[] {
  const count = Math.max(0, Math.min(Math.floor(days), MAX_DAYS_BACK + 1));
  return Array.from({ length: count }, (_, index) => addDays(today, -index));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A stored day as the calendar's Date: local noon, so no time zone moves it a day. */
export function dayToDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

/** The calendar's chosen Date back to the stored `YYYY-MM-DD` (the day the person tapped). */
export function dateToDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Whether a save right now will wait on this phone: the app has seen the
 * connection fail, or older entries already tried and are still waiting.
 * Entries in their own Undo window (never tried) and refused ones say nothing.
 */
export function savesToPhoneOnly(
  pending: readonly QueuedExpense[],
  input: { isOffline: boolean; exceptId: string },
): boolean {
  if (input.isOffline) return true;
  return pending.some((entry) => entry.id !== input.exceptId && entry.refusedReason === null && entry.attempts > 0);
}

/** "Saved · LPG ₱1,250" — the snackbar after a save. */
export function savedMessage(categoryName: string, cents: number, isQueued: boolean): string {
  const short = categoryName.replace(/\s*\(.*\)\s*$/, "");
  return `${isQueued ? "Saved on this phone" : "Saved"} · ${short} ${formatPeso(cents)}`;
}

/** Which categories the sheet offers: everything spendable, or only the "not an expense" kinds. */
export function categoriesForScope(
  categories: readonly ExpenseCategory[],
  scope: ExpenseSheetScope,
  bill?: BillPayContext | null,
): ExpenseCategory[] {
  return categories.filter(
    (category) =>
      // A bill may sit on a "cash moved" category (a loan payment): paying it keeps it.
      category.id === bill?.categoryId ||
      (scope === "take_out" ? category.group === "not_expense" : category.group !== "not_expense"),
  );
}
