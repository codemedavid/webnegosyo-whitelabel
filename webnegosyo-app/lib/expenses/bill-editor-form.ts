/**
 * The add / edit bill sheet's decisions, without the sheet (bills-contract §3,
 * §5). The engine (`bill-schedule.ts`) owns the rules and the words of every
 * refusal (`validateBillDraft`); this file turns what the owner tapped —
 * a preset, "Same every time", "Every month" on the 24th — into a `BillInput`.
 *
 * Ingredient categories are never offered: receiving stock already counts
 * that cost, so a bill for it would count it twice.
 */

import {
  BILL_AFTER_DAYS_MAX,
  BILL_PRESETS,
  BILL_REMIND_MAX_DAYS,
  nextDueDates,
  validateBillDraft,
  type Bill,
  type BillDraftField,
  type BillPaidFrom,
  type BillPayment,
  type BillPreset,
  type BillRule,
  type DayOfMonth,
} from "./bill-schedule";
import type { BillInput } from "./bills-service";
import type { BillPrefill } from "./bills-route";
import { sortCategories } from "./categories";
import { shortCategoryName } from "./category-look";
import { EMPTY_KEYPAD, keypadCents, keypadFromCents, type KeypadState } from "./keypad";
import { addDays } from "./manila-date";
import type { ExpenseCategory } from "./types";

export type AmountMode = "fixed" | "varies";

export type Frequency = "monthly" | "twice_monthly" | "weekly" | "every_2_weeks" | "months_3" | "yearly" | "after_days";

/** The "Every N months" chip's words for this form (3 unless an edited bill uses 2, 4 or 6). */
export function frequencyLabel(option: { value: Frequency; label: string }, form: Pick<BillEditorForm, "monthsEvery">): string {
  return option.value === "months_3" ? `Every ${form.monthsEvery} months` : option.label;
}

export const FREQUENCY_OPTIONS: readonly { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Every month" },
  { value: "twice_monthly", label: "Twice a month" },
  { value: "weekly", label: "Every week" },
  { value: "every_2_weeks", label: "Every 2 weeks" },
  { value: "months_3", label: "Every 3 months" },
  { value: "yearly", label: "Every year" },
  { value: "after_days", label: "Every few days, like LPG" },
];

export const AMOUNT_MODES: readonly { value: AmountMode; label: string }[] = [
  { value: "fixed", label: "Same every time" },
  { value: "varies", label: "Changes every time" },
];

export const WEEKDAY_CHOICES: readonly { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/** The day grid: 1..31, then "Last day". */
export const DAY_CHOICES: readonly DayOfMonth[] = [...Array.from({ length: 31 }, (_, index) => index + 1), "last"];

export const REMIND_PRESETS: readonly number[] = [0, 1, 3];
export const AFTER_DAYS_PRESETS: readonly number[] = [7, 10, 14, 30];
export const SHORT_MONTH_HINT = "In shorter months we remind you on the last day.";
export const EDIT_NOTE = "Changes apply to the next ones. Past payments stay as they are.";

const SHORTEST_MONTH_DAYS = 28;
const DEFAULT_AFTER_DAYS = 10;
const DEFAULT_REMIND_DAYS = 1;
const MONTHS_AHEAD_CHOICES = 12;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface BillEditorForm {
  /** The preset chip last tapped ("rent"); null for Other or an edit. */
  presetKey: string | null;
  name: string;
  categoryId: string | null;
  amountMode: AmountMode;
  keypad: KeypadState;
  frequency: Frequency;
  /** monthly / every 3 months / every year. */
  day: DayOfMonth;
  /** Twice a month. */
  days: [DayOfMonth, DayOfMonth];
  /** 0 Sunday .. 6 Saturday. */
  weekday: number;
  /** "About every N days". */
  afterDays: number;
  /** Every N months (the sheet offers 3; an edited bill keeps its own 2, 4 or 6). */
  monthsEvery: 2 | 3 | 4 | 6;
  remindDaysBefore: number;
  paidFrom: BillPaidFrom;
  paidToName: string;
  /** null = the whole store. */
  outletId: string | null;
  startsOn: string;
  /** True until the owner picks a start: it then follows the rule (LPG: today + N days). */
  isStartAuto: boolean;
  /** Kept from an edited bill; the sheet does not set it. */
  endsOn: string | null;
}

function dayOfDate(date: string): DayOfMonth {
  return Number(date.slice(8, 10));
}

function weekdayOfDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function emptyBillForm(today: string, outletId: string | null): BillEditorForm {
  return {
    presetKey: null,
    name: "",
    categoryId: null,
    amountMode: "fixed",
    keypad: EMPTY_KEYPAD,
    frequency: "monthly",
    day: dayOfDate(today),
    days: [15, "last"],
    weekday: weekdayOfDate(today),
    afterDays: DEFAULT_AFTER_DAYS,
    monthsEvery: 3,
    remindDaysBefore: DEFAULT_REMIND_DAYS,
    paidFrom: "cash",
    paidToName: "",
    outletId,
    startsOn: today,
    isStartAuto: true,
    endsOn: null,
  };
}

// ── Categories and presets ───────────────────────────────────────────────

/** Every category a bill may use: never an Ingredients one, never an archived one. */
export function billCategories(categories: readonly ExpenseCategory[]): ExpenseCategory[] {
  return sortCategories(categories.filter((category) => category.archivedAt === null && category.group !== "ingredients"));
}

/** The store's category a preset stands for (by seeded key), if it has one a bill may use. */
export function presetCategory(preset: BillPreset, categories: readonly ExpenseCategory[]): ExpenseCategory | null {
  return billCategories(categories).find((category) => category.systemKey === preset.systemKey) ?? null;
}

/** The preset chips: Rent, Kuryente… — "Other" is the separate "Other…" chip. */
export function offeredPresets(categories: readonly ExpenseCategory[]): BillPreset[] {
  return BILL_PRESETS.filter((preset) => preset.key !== "other" && presetCategory(preset, categories) !== null);
}

/** The form's frequency controls for an engine rule. */
export function withRule(form: BillEditorForm, rule: BillRule): BillEditorForm {
  switch (rule.kind) {
    case "monthly":
      return { ...form, frequency: "monthly", day: rule.day };
    case "twice_monthly":
      return { ...form, frequency: "twice_monthly", days: [rule.days[0], rule.days[1]] };
    case "weekly":
      return { ...form, frequency: rule.every === 2 ? "every_2_weeks" : "weekly", weekday: rule.weekday };
    case "months":
      // Every year is its own choice; 2, 4 and 6 keep their own count so an edit never changes it.
      return rule.every === 12
        ? { ...form, frequency: "yearly", day: rule.day }
        : { ...form, frequency: "months_3", monthsEvery: rule.every, day: rule.day };
    case "after_days":
      return { ...form, frequency: "after_days", afterDays: rule.every };
  }
}

/** One tap on a preset: its name, category, how often, fixed or changing, and how early to remind. */
export function applyPreset(form: BillEditorForm, preset: BillPreset, categories: readonly ExpenseCategory[]): BillEditorForm {
  const category = presetCategory(preset, categories);
  return withRule(
    {
      ...form,
      presetKey: preset.key,
      name: preset.name,
      categoryId: category?.id ?? form.categoryId,
      amountMode: preset.amountMode,
      remindDaysBefore: preset.remindDaysBefore,
    },
    preset.rule,
  );
}

/** Picking a category under "Other…": the name follows it until the owner types one. */
export function pickCategory(form: BillEditorForm, category: ExpenseCategory): BillEditorForm {
  const name = form.name.trim() === "" ? shortCategoryName(category.name) : form.name;
  return { ...form, presetKey: null, categoryId: category.id, name };
}

/** A link's values ("Make it a bill?", "Repeat this"); an Ingredients category is never taken. */
export function formFromPrefill(
  today: string,
  outletId: string | null,
  prefill: BillPrefill,
  categories: readonly ExpenseCategory[],
): BillEditorForm {
  const base = emptyBillForm(today, outletId);
  const category = billCategories(categories).find((candidate) => candidate.id === prefill.categoryId) ?? null;
  const preset = category ? BILL_PRESETS.find((candidate) => candidate.key !== "other" && candidate.systemKey === category.systemKey) : undefined;
  const seeded = preset ? applyPreset(base, preset, categories) : category ? pickCategory(base, category) : base;
  const withName = prefill.name ? { ...seeded, name: prefill.name } : seeded;
  const withAmount =
    prefill.amountCents !== null ? { ...withName, amountMode: "fixed" as const, keypad: keypadFromCents(prefill.amountCents) } : withName;
  return prefill.day !== null ? { ...withAmount, frequency: "monthly", day: prefill.day } : withAmount;
}

/** The sheet opened on an existing bill. */
export function formFromBill(bill: Bill): BillEditorForm {
  return withRule(
    {
      ...emptyBillForm(bill.startsOn, bill.outletId),
      name: bill.name,
      categoryId: bill.categoryId,
      amountMode: bill.amountCents === null ? "varies" : "fixed",
      keypad: bill.amountCents === null ? EMPTY_KEYPAD : keypadFromCents(bill.amountCents),
      remindDaysBefore: bill.remindDaysBefore,
      paidFrom: bill.paidFrom,
      paidToName: bill.paidToName ?? "",
      startsOn: bill.startsOn,
      isStartAuto: false,
      endsOn: bill.endsOn,
    },
    bill.rule,
  );
}

// ── Rule, start and preview ──────────────────────────────────────────────

export function ruleOf(form: BillEditorForm): BillRule {
  switch (form.frequency) {
    case "monthly":
      return { kind: "monthly", day: form.day };
    case "twice_monthly":
      return { kind: "twice_monthly", days: form.days };
    case "weekly":
      return { kind: "weekly", every: 1, weekday: form.weekday };
    case "every_2_weeks":
      return { kind: "weekly", every: 2, weekday: form.weekday };
    case "months_3":
      return { kind: "months", every: form.monthsEvery, day: form.day };
    case "yearly":
      return { kind: "months", every: 12, day: form.day };
    case "after_days":
      return { kind: "after_days", every: form.afterDays };
  }
}

/** Where the schedule counts from: a picked start, else today — or, for LPG, today + N days. */
export function startOf(form: BillEditorForm, today: string): string {
  if (!form.isStartAuto) return form.startsOn;
  return form.frequency === "after_days" ? addDays(today, form.afterDays) : today;
}

/** The live "Next three" dates; an edited bill passes its id and payments (LPG counts from the last one). */
export function previewDates(
  form: BillEditorForm,
  today: string,
  payments: readonly BillPayment[] = [],
  billId?: string,
): string[] {
  const schedule = { id: billId, rule: ruleOf(form), startsOn: startOf(form, today), endsOn: form.endsOn };
  return nextDueDates(schedule, today, 3, billId === undefined ? [] : payments);
}

/** "In shorter months we remind you on the last day." for days 29–31. */
export function shortMonthHint(form: BillEditorForm): string | null {
  const days: DayOfMonth[] =
    form.frequency === "twice_monthly" ? form.days : ["monthly", "months_3", "yearly"].includes(form.frequency) ? [form.day] : [];
  return days.some((day) => day !== "last" && day > SHORTEST_MONTH_DAYS) ? SHORT_MONTH_HINT : null;
}

/** Twice a month: a tap on a new day replaces the older pick, so two stay chosen. */
export function toggleTwiceDay(days: [DayOfMonth, DayOfMonth], day: DayOfMonth): [DayOfMonth, DayOfMonth] {
  if (days.includes(day)) return days;
  return [days[1], day];
}

export function dayLabel(day: DayOfMonth): string {
  return day === "last" ? "Last day" : String(day);
}

export function remindLabel(days: number): string {
  if (days === 0) return "On the day";
  return days === 1 ? "1 day before" : `${days} days before`;
}

export function clampRemind(days: number): number {
  return Math.max(0, Math.min(BILL_REMIND_MAX_DAYS, Math.round(days)));
}

export function clampAfterDays(days: number): number {
  return Math.max(1, Math.min(BILL_AFTER_DAYS_MAX, Math.round(days)));
}

export interface StartChoice {
  key: string;
  label: string;
  startsOn: string;
}

function firstOfMonth(date: string, monthsAhead: number): string {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + monthsAhead, 1)).toISOString().slice(0, 10);
}

/** "Starts": today, or the start of this or last month (to catch a bill already due). */
export function startChoices(today: string): StartChoice[] {
  const thisMonth = firstOfMonth(today, 0);
  const lastMonth = firstOfMonth(today, -1);
  const label = (date: string) => `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]}`;
  const choices = [{ key: "today", label: "Today", startsOn: today }];
  if (thisMonth !== today) choices.push({ key: "this", label: label(thisMonth), startsOn: thisMonth });
  return [...choices, { key: "last", label: label(lastMonth), startsOn: lastMonth }];
}

/** "Every 3 months" / "Every year": which month the first one falls in (this month starts today). */
export function startMonthChoices(today: string): StartChoice[] {
  return Array.from({ length: MONTHS_AHEAD_CHOICES }, (_, index) => {
    const startsOn = index === 0 ? today : firstOfMonth(today, index);
    const month = SHORT_MONTHS[Number(startsOn.slice(5, 7)) - 1];
    const label = startsOn.slice(0, 4) === today.slice(0, 4) ? month : `${month} ${startsOn.slice(0, 4)}`;
    return { key: startsOn.slice(0, 7), label, startsOn };
  });
}

/** Whether the frequency asks which month the first one falls in. */
export function asksStartMonth(frequency: Frequency): boolean {
  return frequency === "months_3" || frequency === "yearly";
}

// ── Save ─────────────────────────────────────────────────────────────────

export function toBillInput(form: BillEditorForm, today: string): BillInput {
  return {
    name: form.name.trim(),
    categoryId: form.categoryId ?? "",
    amountCents: form.amountMode === "fixed" ? keypadCents(form.keypad) : null,
    rule: ruleOf(form),
    startsOn: startOf(form, today),
    endsOn: form.endsOn,
    remindDaysBefore: form.remindDaysBefore,
    paidFrom: form.paidFrom,
    paidToName: form.paidToName.trim() === "" ? null : form.paidToName.trim(),
    outletId: form.outletId,
  };
}

export type BillFormField = BillDraftField | "keypad";
export type BillFormCheck = { ok: true; input: BillInput } | { ok: false; field: BillFormField; message: string };

/**
 * The first thing to fix, in plain words; the engine's words for everything it
 * checks. Editing passes the bill's stored start, which is never "too old".
 */
export function checkBillForm(form: BillEditorForm, today: string, savedStartsOn: string | null = null): BillFormCheck {
  if (form.name.trim() === "") return { ok: false, field: "name", message: "Give the bill a name" };
  if (form.categoryId === null) return { ok: false, field: "categoryId", message: "Pick what the bill is for" };
  if (form.amountMode === "fixed" && keypadCents(form.keypad) <= 0) {
    return { ok: false, field: "keypad", message: "Type the usual amount, or pick Changes every time" };
  }
  const input = toBillInput(form, today);
  const check = validateBillDraft(input, today, { savedStartsOn });
  return check.ok ? { ok: true, input } : { ok: false, field: check.field, message: check.message };
}
