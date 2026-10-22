/**
 * "Bills to pay" as the screens draw it (bills-contract §5): which group a due
 * date sits in, what its pill says, how its amount reads, and which recorded
 * expenses "I already recorded it" may offer. Pure, so every word is tested
 * without a renderer; the engine (`bill-schedule.ts`, shared with the web)
 * decides the due dates and states.
 *
 * A bill is a reminder: nothing here is money the store spent.
 */

import {
  OPEN_STATES,
  billsDue,
  estimateCents,
  monthKeyOf,
  nextDueDates,
  ruleSentence,
  stillToPay,
  type Bill,
  type BillMark,
  type BillPayment,
  type BillRule,
  type Occurrence,
  type StillToPay,
} from "./bill-schedule";
import { billHref, repeatExpenseHref } from "./bills-route";
import { shortCategoryName } from "./category-look";
import { formatCents } from "./expense-format";
import { addDays, daysBetween } from "./manila-date";
import type { Expense, ExpenseCategory } from "./types";

// ── Words for dates ──────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
/** "This week" = due today and the six days after. */
export const WEEK_DAYS_AHEAD = 6;
/** "I already recorded it" offers expenses this many days either side of the due date. */
export const LINK_WINDOW_DAYS = 10;
/** The Expenses home card lists at most this many bills. */
export const HOME_CARD_ROWS = 3;

function partsOf(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function weekdayOf(date: string): string {
  const { year, month, day } = partsOf(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** "Thu 24 Oct", or "Thu 24 Oct 2027" outside today's year. */
export function shortDate(date: string, today: string): string {
  const { year, month, day } = partsOf(date);
  const head = `${weekdayOf(date)} ${day} ${SHORT_MONTHS[month - 1]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? head : `${head} ${year}`;
}

/** "24 Oct" (with the year outside today's). */
export function dayMonth(date: string, today: string): string {
  const { year, month, day } = partsOf(date);
  const head = `${day} ${SHORT_MONTHS[month - 1]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? head : `${head} ${year}`;
}

/** "October" for a date. */
export function monthName(date: string): string {
  return LONG_MONTHS[partsOf(date).month - 1] ?? date.slice(0, 7);
}

/** "tomorrow", "Fri", "24 Oct" — how soon a date is, in one or two words. */
export function whenWords(date: string, today: string): string {
  const ahead = daysBetween(today, date);
  if (ahead === 0) return "today";
  if (ahead === 1) return "tomorrow";
  if (ahead > 1 && ahead <= WEEK_DAYS_AHEAD) return weekdayOf(date);
  return dayMonth(date, today);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// ── Pills, amounts, notes ────────────────────────────────────────────────

export type BillPillTone = "late" | "today" | "soon" | "later" | "snoozed" | "paused" | "paid" | "skipped";

export interface BillPill {
  text: string;
  tone: BillPillTone;
}

/** The state in words: "2 days late", "Due today", "Due Thu", "Due 24 Oct", "Paid". */
export function billPill(occurrence: Occurrence, today: string): BillPill {
  switch (occurrence.state) {
    case "late": {
      const days = Math.max(1, occurrence.daysLate);
      return { text: `${days} ${days === 1 ? "day" : "days"} late`, tone: "late" };
    }
    case "due_today":
      return { text: "Due today", tone: "today" };
    case "due_soon":
      return { text: `Due ${whenWords(occurrence.dueOn, today)}`, tone: "soon" };
    case "upcoming":
      return { text: `Due ${whenWords(occurrence.dueOn, today)}`, tone: "later" };
    case "snoozed":
      return { text: `Reminding ${whenWords(occurrence.snoozedUntil ?? addDays(today, 1), today)}`, tone: "snoozed" };
    case "paid":
      return { text: "Paid", tone: "paid" };
    case "skipped":
      return { text: "Nothing to pay", tone: "skipped" };
  }
}

/** "₱6,200", "about ₱6,200" for an estimate, null when nothing is known yet. */
export function amountText(occurrence: Pick<Occurrence, "amountCents" | "isEstimate">): string | null {
  if (occurrence.amountCents === null) return null;
  const money = formatCents(occurrence.amountCents, { compact: true });
  return occurrence.isEstimate ? `about ${money}` : money;
}

const LATE_UNITS: Readonly<Record<BillRule["kind"], string>> = {
  monthly: "months",
  months: "times",
  twice_monthly: "times",
  weekly: "weeks",
  after_days: "times",
};

/** "3 months not marked" for a collapsed late row; null for a single one. */
export function lateNote(occurrence: Occurrence, rule: BillRule): string | null {
  if (occurrence.state !== "late" || occurrence.lateCount <= 1) return null;
  return `${occurrence.lateCount} ${LATE_UNITS[rule.kind]} not marked`;
}

/** "Due Thu 24 Oct · every month on the 24th" — the bill sheet's line under the name. */
export function dueLine(bill: Pick<Bill, "rule" | "startsOn">, dueOn: string, today: string): string {
  return `Due ${shortDate(dueOn, today)} · ${lowerFirst(ruleSentence(bill.rule, bill.startsOn))}`;
}

/** The due date a tap acts on: a collapsed late row settles its OLDEST date first. */
export function targetDueOn(occurrence: Occurrence): string {
  return occurrence.lateDueOns[0] ?? occurrence.dueOn;
}

// ── Rows and groups ──────────────────────────────────────────────────────

export type BillGroupKey = "late" | "week" | "later" | "paused" | "settled";

export const BILL_GROUP_TITLES: Readonly<Record<BillGroupKey, string>> = {
  late: "Late",
  week: "This week",
  later: "Later",
  paused: "Paused",
  settled: "Paid this month",
};

/** Groups folded until tapped. */
export const FOLDED_GROUPS: ReadonlySet<BillGroupKey> = new Set(["paused", "settled"]);

export interface BillRowModel {
  key: string;
  bill: Bill;
  occurrence: Occurrence;
  pill: BillPill;
  /** "₱6,200" / "about ₱6,200"; null = the amount changes and nothing was paid yet. */
  amount: string | null;
  /** "Every month on the 5th". */
  rule: string;
  /** "3 months not marked". */
  note: string | null;
  isOpen: boolean;
}

export interface BillGroup {
  key: BillGroupKey;
  title: string;
  rows: BillRowModel[];
}

export interface BillBoardInput {
  bills: readonly Bill[];
  payments: readonly BillPayment[];
  marks: readonly BillMark[];
  today: string;
}

export interface BillsView {
  groups: BillGroup[];
  /** Every open row, late first (the home card's source). */
  open: BillRowModel[];
  still: StillToPay;
  /** Bills that are not stopped. */
  billCount: number;
}

function blankUpcoming(bill: Bill, dueOn: string, payments: readonly BillPayment[]): Occurrence {
  const estimate = estimateCents(bill, payments);
  return {
    billId: bill.id,
    dueOn,
    state: "upcoming",
    amountCents: estimate,
    isEstimate: bill.amountCents === null && estimate !== null,
    payment: null,
    daysLate: 0,
    lateCount: 0,
    lateDueOns: [],
    snoozedUntil: null,
  };
}

function toRow(bill: Bill, occurrence: Occurrence, today: string, pill?: BillPill): BillRowModel {
  return {
    key: `${bill.id}|${occurrence.dueOn}|${occurrence.state}`,
    bill,
    occurrence,
    pill: pill ?? billPill(occurrence, today),
    amount: amountText(occurrence),
    rule: ruleSentence(bill.rule, bill.startsOn),
    note: lateNote(occurrence, bill.rule),
    isOpen: OPEN_STATES.has(occurrence.state),
  };
}

/** When an open row next needs the owner: its due date, or the day a snooze ends. */
function effectiveDate(occurrence: Occurrence): string {
  return occurrence.state === "snoozed" && occurrence.snoozedUntil ? occurrence.snoozedUntil : occurrence.dueOn;
}

function pausedPill(bill: Bill, today: string): BillPill {
  return { text: bill.pausedUntil ? `Paused till ${dayMonth(bill.pausedUntil, today)}` : "Paused", tone: "paused" };
}

/** Paused right now: open-ended, or until a day still ahead. */
export function isPausedNow(bill: Pick<Bill, "status" | "pausedUntil">, today: string): boolean {
  return bill.status === "paused" && (bill.pausedUntil === null || bill.pausedUntil > today);
}

type GroupedRows = Partial<Record<BillGroupKey, BillRowModel[]>>;

/** One bill's rows, by group. A bill with nothing near still shows once, under Later. */
function rowsForBill(bill: Bill, occurrences: readonly Occurrence[], input: BillBoardInput): GroupedRows {
  const { today, payments } = input;
  const weekEnd = addDays(today, WEEK_DAYS_AHEAD);
  const settled = occurrences.filter((o) => o.state === "paid" || o.state === "skipped").map((o) => toRow(bill, o, today));
  if (bill.status === "ended") return { settled };
  if (isPausedNow(bill, today)) {
    const resumesOn = bill.pausedUntil ?? today;
    return { paused: [toRow(bill, blankUpcoming(bill, resumesOn, payments), today, pausedPill(bill, today))], settled };
  }
  const open = occurrences.filter((o) => OPEN_STATES.has(o.state));
  const late = open.filter((o) => o.state === "late").map((o) => toRow(bill, o, today));
  const week = open.filter((o) => o.state !== "late" && effectiveDate(o) <= weekEnd).map((o) => toRow(bill, o, today));
  if (late.length > 0 || week.length > 0) return { late, week, settled };
  const [nextOpen] = open.filter((o) => effectiveDate(o) > weekEnd);
  if (nextOpen) return { later: [toRow(bill, nextOpen, today)], settled };
  const [next] = nextDueDates(bill, today, 1, payments);
  return { later: next ? [toRow(bill, blankUpcoming(bill, next, payments), today)] : [], settled };
}

const GROUP_ORDER: readonly BillGroupKey[] = ["late", "week", "later", "paused", "settled"];

function compareRows(a: BillRowModel, b: BillRowModel): number {
  const byDate = effectiveDate(a.occurrence).localeCompare(effectiveDate(b.occurrence));
  return byDate || a.bill.name.localeCompare(b.bill.name, undefined, { sensitivity: "base" }) || a.bill.id.localeCompare(b.bill.id);
}

/**
 * The board as groups: Late, This week (due within 6 days, or a snooze ending
 * by then), Later (each bill's next one), Paused, Paid this month. Stopped bills
 * show only what they were paid this month.
 */
export function buildBillsView(input: BillBoardInput): BillsView {
  const ctx = { today: input.today, payments: input.payments, marks: input.marks };
  const occurrences = billsDue(input.bills, ctx);
  const byBill = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences) byBill.set(occurrence.billId, [...(byBill.get(occurrence.billId) ?? []), occurrence]);

  const buckets = new Map<BillGroupKey, BillRowModel[]>(GROUP_ORDER.map((key) => [key, []]));
  for (const bill of input.bills) {
    const parts = rowsForBill(bill, byBill.get(bill.id) ?? [], input);
    for (const key of GROUP_ORDER) buckets.set(key, [...(buckets.get(key) ?? []), ...(parts[key] ?? [])]);
  }
  const sorted = (key: BillGroupKey) => [...(buckets.get(key) ?? [])].sort(compareRows);
  const groups = GROUP_ORDER.map((key) => ({ key, title: BILL_GROUP_TITLES[key], rows: sorted(key) })).filter((group) => group.rows.length > 0);
  return {
    groups,
    open: [...sorted("late"), ...[...sorted("week"), ...sorted("later")].sort(compareRows)],
    still: stillToPay(occurrences, monthKeyOf(input.today)),
    billCount: input.bills.filter((bill) => bill.status !== "ended").length,
  };
}

// ── Headlines ────────────────────────────────────────────────────────────

/** The screen's subtitle: "₱24,500 left in October", "about ₱…" with an estimate. */
export function leftToPayText(still: StillToPay, today: string): string {
  const month = monthName(today);
  if (still.count === 0) return `Nothing left to pay in ${month}`;
  const money = formatCents(still.cents, { compact: true });
  return `${still.hasEstimate ? "about " : ""}${money} left in ${month}`;
}

/** The Expenses hero line: "₱24,500 still to pay · 3 bills"; null when nothing is open this month. */
export function stillToPayLine(still: StillToPay): string | null {
  if (still.count === 0) return null;
  const money = formatCents(still.cents, { compact: true });
  return `${still.hasEstimate ? "about " : ""}${money} still to pay · ${still.count} ${still.count === 1 ? "bill" : "bills"}`;
}

/** "Paid for: Rent · October" on an expense that paid a bill. */
export function paidForText(billName: string | null, dueOn: string | null): string {
  const name = billName ?? "A bill";
  return dueOn ? `${name} · ${monthName(dueOn)}` : name;
}

/** "For: October bill · due Thu 24 Oct" on the pay sheet. */
export function payForLine(dueOn: string, today: string): string {
  return `For: ${monthName(dueOn)} bill · due ${shortDate(dueOn, today)}`;
}

// ── The bill sheet ───────────────────────────────────────────────────────

/** The last `n` payments of one bill, newest first. */
export function recentPayments(billId: string, payments: readonly BillPayment[], n = 3): BillPayment[] {
  return payments
    .filter((payment) => payment.billId === billId)
    .sort((a, b) => b.dueOn.localeCompare(a.dueOn) || b.spentOn.localeCompare(a.spentOn))
    .slice(0, n);
}

/** "₱15,000 every time", "Last 3: ₱5,800 · ₱6,400 · ₱6,100", or "Changes every time". */
export function usualAmountLine(bill: Pick<Bill, "id" | "amountCents">, payments: readonly BillPayment[]): string {
  if (bill.amountCents !== null) return `${formatCents(bill.amountCents, { compact: true })} every time`;
  const last = recentPayments(bill.id, payments);
  if (last.length === 0) return "Changes every time";
  return `Last ${last.length}: ${last.map((payment) => formatCents(payment.amountCents, { compact: true })).join(" · ")}`;
}

export interface AmountChip {
  label: string;
  cents: number;
}

/** "Usual ₱6,200" / "Last ₱6,100" for a bill whose amount changes; none for a fixed one. */
export function amountChips(usualCents: number | null, lastCents: number | null): AmountChip[] {
  const chips: AmountChip[] = [];
  if (usualCents !== null && usualCents > 0) chips.push({ label: `Usual ${formatCents(usualCents, { compact: true })}`, cents: usualCents });
  if (lastCents !== null && lastCents > 0 && lastCents !== usualCents) {
    chips.push({ label: `Last ${formatCents(lastCents, { compact: true })}`, cents: lastCents });
  }
  return chips;
}

/** What the pay sheet needs to know about a bill and the due date it settles. */
export interface BillPayContext {
  billId: string;
  dueOn: string;
  name: string;
  /** Fixed bills: the amount. Null when it changes every time. */
  amountCents: number | null;
  usualCents: number | null;
  lastCents: number | null;
  categoryId: string;
  paidFrom: Bill["paidFrom"];
  paidToName: string | null;
  supplierId: string | null;
  /** The bill's branch (null = whole store): the payment is filed there too. */
  outletId?: string | null;
}

export function payContextFor(bill: Bill, dueOn: string, payments: readonly BillPayment[]): BillPayContext {
  const [last] = recentPayments(bill.id, payments, 1);
  return {
    billId: bill.id,
    dueOn,
    name: bill.name,
    amountCents: bill.amountCents,
    usualCents: bill.amountCents === null ? estimateCents(bill, payments) : null,
    lastCents: bill.amountCents === null ? (last?.amountCents ?? null) : null,
    categoryId: bill.categoryId,
    paidFrom: bill.paidFrom,
    paidToName: bill.paidToName,
    supplierId: bill.supplierId,
    outletId: bill.outletId,
  };
}

/**
 * "I already recorded it": recorded expenses in the bill's category, within
 * 10 days of the due date, not already paying a bill — closest first.
 */
export function linkCandidates(expenses: readonly Expense[], bill: Pick<Bill, "categoryId">, dueOn: string): Expense[] {
  const distance = (expense: Expense) => Math.abs(daysBetween(dueOn, expense.spentOn));
  return expenses
    .filter(
      (expense) =>
        expense.status === "recorded" &&
        expense.billId === null &&
        expense.categoryId === bill.categoryId &&
        distance(expense) <= LINK_WINDOW_DAYS,
    )
    .sort((a, b) => distance(a) - distance(b) || b.spentOn.localeCompare(a.spentOn) || a.id.localeCompare(b.id));
}

/** The months "I already recorded it" reads: the due date ± 10 days. */
export function linkWindowMonths(dueOn: string): string[] {
  const first = monthKeyOf(addDays(dueOn, -LINK_WINDOW_DAYS));
  const last = monthKeyOf(addDays(dueOn, LINK_WINDOW_DAYS));
  return first === last ? [first] : [first, last];
}

/** "Your 4 past payments stay in Expenses." — the count only when the board saw every one. */
export function stopNote(bill: Pick<Bill, "id" | "createdAt">, payments: readonly BillPayment[], historyFrom: string): string {
  const count = payments.filter((payment) => payment.billId === bill.id).length;
  const sawEverything = bill.createdAt.slice(0, 10) >= historyFrom;
  if (count === 0 && sawEverything) return "Nothing you paid changes. It just stops reminding you.";
  if (!sawEverything) return "Every past payment stays in Expenses. It just stops reminding you.";
  return `Your ${count} past ${count === 1 ? "payment stays" : "payments stay"} in Expenses. It just stops reminding you.`;
}

export interface PauseChoice {
  key: string;
  label: string;
  /** null = until resumed by hand. */
  until: string | null;
}

function firstOfMonthsAhead(today: string, months: number): string {
  const { year, month } = partsOf(today);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}

/** "Until I turn it back on", "Until 1 Dec", "Until 1 Jan". */
export function pauseChoices(today: string): PauseChoice[] {
  const next = firstOfMonthsAhead(today, 1);
  const after = firstOfMonthsAhead(today, 2);
  return [
    { key: "open", label: "Until I turn it back on", until: null },
    { key: "next", label: `Until ${dayMonth(next, today)}`, until: next },
    { key: "after", label: `Until ${dayMonth(after, today)}`, until: after },
  ];
}

/**
 * The row a sheet shows for a bill: that due date if still listed, else the
 * bill's first open one, else any of its rows (paused, paid). Null when the
 * bill is not on the board (stopped, or out of reach).
 */
export function findBillRow(view: Pick<BillsView, "groups">, billId: string, dueOn?: string | null): BillRowModel | null {
  const rows = view.groups.flatMap((group) => group.rows).filter((row) => row.bill.id === billId);
  if (rows.length === 0) return null;
  const exact = dueOn ? rows.find((row) => row.occurrence.dueOn === dueOn || row.occurrence.lateDueOns.includes(dueOn)) : undefined;
  return exact ?? rows.find((row) => row.isOpen) ?? rows[0];
}

export type DetailBillLink =
  | { kind: "paid_for"; text: string; href: string }
  | { kind: "repeat"; categoryName: string; href: string }
  | null;

/**
 * The expense detail's bill line: "Paid for: Rent · October" when it paid a
 * bill; "Repeat this" for a recorded spend that could be a bill (not
 * ingredients, not cash moved, no live bill on that category yet); else nothing.
 */
export function detailBillLink(input: {
  expense: Pick<Expense, "billId" | "billDueOn" | "categoryId" | "amountCents" | "spentOn" | "status">;
  category: Pick<ExpenseCategory, "name" | "group"> | null;
  bills: readonly Pick<Bill, "id" | "name" | "categoryId" | "status">[];
  canManage: boolean;
}): DetailBillLink {
  const { expense, category, bills, canManage } = input;
  // Bills are behind the expenses key: a link to them is too.
  if (!canManage) return null;
  if (expense.billId) {
    const bill = bills.find((candidate) => candidate.id === expense.billId) ?? null;
    return { kind: "paid_for", text: paidForText(bill?.name ?? null, expense.billDueOn), href: billHref(expense.billId) };
  }
  if (expense.status !== "recorded" || !category) return null;
  if (category.group === "ingredients" || category.group === "not_expense") return null;
  const hasLiveBill = bills.some((bill) => bill.categoryId === expense.categoryId && bill.status !== "ended");
  if (hasLiveBill) return null;
  return { kind: "repeat", categoryName: shortCategoryName(category.name), href: repeatExpenseHref(expense) };
}
