/**
 * What the expense detail screen says (design brief §4), as pure functions:
 * the status pill, the facts card, the flags explained as callouts with their
 * fix, which actions are offered, the history timeline and the receipt strip.
 *
 * The screen only lays these out. Every rule about WHO may change or void an
 * expense is the one the screen used before the redesign — none is loosened.
 */

import { expenseHistory, type HistoryLine } from "./expense-history";
import { PAID_FROM_LABELS, formatCents, manilaClock, manilaDate, weekdayDate } from "./expense-format";
import type { ExpenseDetail, ExpenseReceiptRef } from "./expense-service";
import { DEFAULT_NO_RECEIPT_THRESHOLD_CENTS, computeFlags } from "./flags";
import { daysBetween } from "./manila-date";
import type { Expense, ExpenseCategory, ExpenseFlag, PaidFrom } from "./types";

const PDF_MIME = "application/pdf";

// ---------------------------------------------------------------- dates

/** "Wed, 22 Oct" (this year) or "Wed, 31 Dec 2025" for a Manila date. */
export const longDayText = weekdayDate;

/**
 * "Wed, 22 Oct · 10:12 AM". The clock is shown only when the row was typed on
 * the day it was spent: for a back-dated row it would be the typing time.
 */
export function whenText(expense: Pick<Expense, "spentOn" | "createdAt">, now: number = Date.now()): string {
  const day = longDayText(expense.spentOn, now);
  const createdMs = Date.parse(expense.createdAt);
  if (!Number.isFinite(createdMs) || manilaDate(createdMs) !== expense.spentOn) return day;
  return `${day} · ${manilaClock(expense.createdAt)}`;
}

// ---------------------------------------------------------------- status

export type PillTone = "good" | "neutral" | "warning" | "danger";

export interface StatusPill {
  readonly text: string;
  readonly tone: PillTone;
}

const PAID_PHRASE: Record<PaidFrom, string> = {
  drawer: "paid from drawer",
  cash: "paid in cash",
  gcash: "paid with GCash",
  maya: "paid with Maya",
  bank: "paid by bank",
  card: "paid by card",
  owner: "paid from the owner's pocket",
};

export interface StatusInput {
  expense: Pick<Expense, "status" | "voidReason" | "paidFrom">;
  /** This row replaced an earlier one. */
  isChange: boolean;
  /** A newer row replaced this one. */
  isReplaced: boolean;
  /** This phone still holds something of it that has not reached the store. */
  isWaitingOnPhone: boolean;
}

export function statusPill({ expense, isChange, isReplaced, isWaitingOnPhone }: StatusInput): StatusPill {
  if (isWaitingOnPhone) return { text: "Waiting to send from this phone", tone: "warning" };
  if (expense.status === "void") {
    if (isReplaced) return { text: "Changed — a newer version replaced this one", tone: "neutral" };
    return { text: expense.voidReason ? `Voided — ${expense.voidReason}` : "Voided", tone: "danger" };
  }
  if (isChange) return { text: "Changed — this is the new version", tone: "good" };
  return { text: `Recorded · ${PAID_PHRASE[expense.paidFrom]}`, tone: "good" };
}

// ---------------------------------------------------------------- facts

export interface FactRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function paidFromText(detail: ExpenseDetail): string {
  const { expense, drawer } = detail;
  if (expense.paidFrom !== "drawer") return PAID_FROM_LABELS[expense.paidFrom];
  const name = drawer?.drawerName ?? "Cash drawer";
  if (!drawer) return name;
  return `${name} · ${drawer.isShiftOpen ? "shift still open" : "shift closed"}`;
}

export interface FactInput {
  detail: ExpenseDetail;
  /** The branch's name; null hides the row (a store without branches). */
  branchName: string | null;
  now?: number;
}

export function factRows({ detail, branchName, now = Date.now() }: FactInput): FactRow[] {
  const { expense } = detail;
  const optional: (FactRow | null)[] = [
    branchName !== null ? { key: "branch", label: "Branch", value: branchName } : null,
    { key: "recordedBy", label: "Recorded by", value: expense.createdByName },
    expense.paidToName ? { key: "paidTo", label: "Paid to", value: expense.paidToName } : null,
    expense.invoiceNo ? { key: "invoice", label: "Invoice no.", value: expense.invoiceNo } : null,
    expense.isStockPurchase ? { key: "stock", label: "Went into stock", value: "Yes, added to the stock count" } : null,
  ];
  return [
    { key: "when", label: "When", value: whenText(expense, now) },
    { key: "paidFrom", label: "Paid from", value: paidFromText(detail) },
    ...optional.filter((row): row is FactRow => row !== null),
  ];
}

// ---------------------------------------------------------------- flags

export type FlagAction =
  | { readonly kind: "add_receipt"; readonly label: string }
  | { readonly kind: "open_expense"; readonly expenseId: string; readonly label: string };

export interface FlagCallout {
  readonly flag: ExpenseFlag;
  readonly title: string;
  readonly body: string;
  readonly action: FlagAction | null;
}

export interface FlagInput {
  expense: Expense;
  categories: readonly ExpenseCategory[];
  /**
   * Rows to compare against for duplicates (may include this one). Pass the
   * SAME rows the Expenses list flags from — the expense's month, on the same
   * branch — so "Check these" and this screen never disagree.
   */
  others: readonly Expense[];
  /** May add a receipt to this expense. */
  canManage: boolean;
  /** Store setting; undefined = the default, null = never flag a missing receipt. */
  noReceiptThresholdCents?: number | null;
}

function dayPhrase(days: number): string {
  if (days === 0) return "the same day";
  if (days === -1) return "the day before";
  if (days === 1) return "the day after";
  return days < 0 ? `${-days} days before` : `${days} days after`;
}

/** The other row that makes this one look like a duplicate, by the flag's own rule. */
function findTwin(input: FlagInput): Expense | null {
  return (
    input.others.find((other) =>
      computeFlags(input.expense, { categories: input.categories, others: [other], noReceiptThresholdCents: null }).includes(
        "possible_duplicate",
      ),
    ) ?? null
  );
}

function duplicateCallout(input: FlagInput): FlagCallout {
  const twin = findTwin(input);
  if (!twin) {
    return { flag: "possible_duplicate", title: "Might be recorded twice", body: "Another expense looks just like this one.", action: null };
  }
  const name = input.categories.find((category) => category.id === twin.categoryId)?.name ?? "expense";
  const when = dayPhrase(daysBetween(input.expense.spentOn, twin.spentOn));
  return {
    flag: "possible_duplicate",
    title: "Might be recorded twice",
    body: `Looks like another ${formatCents(twin.amountCents, { compact: true })} ${name} ${when}.`,
    action: { kind: "open_expense", expenseId: twin.id, label: "Open the other one" },
  };
}

function calloutFor(flag: ExpenseFlag, input: FlagInput): FlagCallout {
  switch (flag) {
    case "no_receipt": {
      const threshold = input.noReceiptThresholdCents ?? DEFAULT_NO_RECEIPT_THRESHOLD_CENTS;
      return {
        flag,
        title: "No receipt yet",
        body: `Spends of ${formatCents(threshold, { compact: true })} or more usually have one. Add a photo when you have it.`,
        action: input.canManage ? { kind: "add_receipt", label: "Add photo" } : null,
      };
    }
    case "possible_duplicate":
      return duplicateCallout(input);
    case "round_other":
      return {
        flag,
        title: "A round amount under Other",
        body: "Round amounts under Other are worth a second look. A real category keeps Profit accurate.",
        action: null,
      };
    case "after_hours_void":
      return {
        flag,
        title: "Voided after hours",
        body: `Voided at ${manilaClock(input.expense.voidedAt ?? "")}, outside the usual business day.`,
        action: null,
      };
  }
}

/** Each flag on the expense, explained in a sentence, with its fix when there is one. */
export function flagCallouts(input: FlagInput): FlagCallout[] {
  const flags = computeFlags(input.expense, {
    categories: input.categories,
    others: input.others,
    noReceiptThresholdCents: input.noReceiptThresholdCents,
  });
  return flags.map((flag) => calloutFor(flag, input));
}

// ---------------------------------------------------------------- access

/**
 * Who may read this screen. `full` = the `expenses` key. Without it, a
 * cashier may still open a drawer expense — the database returns only the
 * ones they paid themselves (`expenses_read`) — but with no owner actions.
 * Anything else, or a row that did not come back, is locked.
 */
export type DetailAccess = "full" | "own_drawer" | "locked";

export function detailAccess(input: { canManage: boolean; expense: Pick<Expense, "paidFrom"> | null }): DetailAccess {
  if (input.canManage) return "full";
  return input.expense?.paidFrom === "drawer" ? "own_drawer" : "locked";
}

// ---------------------------------------------------------------- actions

export interface DetailActions {
  readonly canAddReceipt: boolean;
  readonly canChange: boolean;
  readonly canVoid: boolean;
  /** "Voiding puts ₱1,180 back in the drawer." */
  readonly voidNote: string | null;
  /** Why Void is missing on a drawer row whose shift closed. */
  readonly closedShiftNote: string | null;
}

export interface ActionInput {
  /** The `expenses` permission. */
  canManage: boolean;
  expense: Pick<Expense, "status" | "paidFrom" | "amountCents">;
  drawer: ExpenseDetail["drawer"];
}

/**
 * The same rules as before the redesign: change and receipts need `expenses`
 * on a recorded row; a drawer row can be voided only while its shift is open,
 * because voiding puts the cash back in that drawer (an unreadable shift
 * counts as closed).
 */
export function detailActions({ canManage, expense, drawer }: ActionInput): DetailActions {
  const isOpenRow = canManage && expense.status !== "void";
  const isDrawer = expense.paidFrom === "drawer";
  const canVoid = isOpenRow && (!isDrawer || drawer?.isShiftOpen === true);
  return {
    canAddReceipt: isOpenRow,
    canChange: isOpenRow,
    canVoid,
    voidNote: canVoid && isDrawer ? `Voiding puts ${formatCents(expense.amountCents, { compact: true })} back in the drawer.` : null,
    closedShiftNote:
      isOpenRow && isDrawer && !canVoid
        ? "This shift is closed, so the cash can't go back into the drawer. Use Change to fix the category instead."
        : null,
  };
}

// ---------------------------------------------------------------- timeline

export type TimelineTone = "good" | "neutral" | "danger";

export interface TimelineEntry extends HistoryLine {
  readonly tone: TimelineTone;
}

/** `expenseHistory`, in the redesign's words (Fix → Change) with a dot colour per step. */
export function timelineEntries(detail: ExpenseDetail, now: number = Date.now()): TimelineEntry[] {
  const reason = detail.replaces?.voidReason;
  return expenseHistory(detail, now).map((line): TimelineEntry => {
    switch (line.key) {
      case "replaces":
        return { ...line, text: `Changed from an earlier version${reason ? ` (${reason})` : ""}`, tone: "neutral" };
      case "replacedBy":
        return { ...line, text: "Changed — see the new version", tone: "neutral" };
      case "recorded":
        return { ...line, tone: "good" };
      case "voided":
        return { ...line, tone: "danger" };
      default:
        return { ...line, tone: "neutral" };
    }
  });
}

// ---------------------------------------------------------------- receipts

export type ReceiptTile =
  | { readonly key: string; readonly kind: "photo"; readonly receiptId: string; readonly uri: string | null }
  | { readonly key: string; readonly kind: "pdf"; readonly receiptId: string }
  | {
      readonly key: string;
      readonly kind: "waiting";
      readonly uri: string;
      readonly isPdf: boolean;
      /** Set when the server refused the file: it stays on the phone until Try again or Remove. */
      readonly refusedReason: string | null;
    };

export interface WaitingReceipt {
  id: string;
  fileUri: string;
  mime: string;
  refusedReason?: string | null;
}

/**
 * Uploaded receipts in the order they were added (a photo's `uri` is its
 * signed link; null while it loads or when it could not be signed), then the
 * ones still on this phone.
 */
export function receiptTiles(
  receipts: readonly ExpenseReceiptRef[],
  links: Readonly<Record<string, string | null>>,
  waiting: readonly WaitingReceipt[],
): ReceiptTile[] {
  const uploaded = receipts.map((receipt): ReceiptTile =>
    receipt.mime === PDF_MIME
      ? { key: receipt.id, kind: "pdf", receiptId: receipt.id }
      : { key: receipt.id, kind: "photo", receiptId: receipt.id, uri: links[receipt.id] ?? null },
  );
  const local = waiting.map(
    (entry): ReceiptTile => ({
      key: entry.id,
      kind: "waiting",
      uri: entry.fileUri,
      isPdf: entry.mime === PDF_MIME,
      refusedReason: entry.refusedReason ?? null,
    }),
  );
  return [...uploaded, ...local];
}

export interface ViewerItem {
  readonly key: string;
  readonly uri: string;
  readonly isWaiting: boolean;
}

/** The photos the full-screen viewer can page through, in strip order. */
export function viewerItems(tiles: readonly ReceiptTile[]): ViewerItem[] {
  return tiles.flatMap((tile): ViewerItem[] => {
    if (tile.kind === "photo") return tile.uri ? [{ key: tile.key, uri: tile.uri, isWaiting: false }] : [];
    if (tile.kind === "waiting" && !tile.isPdf) return [{ key: tile.key, uri: tile.uri, isWaiting: true }];
    return [];
  });
}
