/**
 * Bills to pay, straight to the platform database (bills-contract §4).
 *
 * A bill is a REMINDER: nothing here writes money. Paying a bill is
 * `recordExpense` with `billId` + `billDueOn` (expense-service.ts). This module
 * reads the bills board, adds / edits / pauses / stops bills, marks one due
 * date ("Nothing to pay this time", "Remind me tomorrow"), and links an
 * expense the owner already recorded ("I already recorded it").
 *
 * Like expense-service: RLS and the triggers are the boundary, the signed-in
 * user's session is the client (`ExpenseDb`, injected so tests never connect),
 * and every write asserts what came back — a refusal under RLS is usually an
 * empty answer, not an error. Bills are not queued offline: a write needs a
 * connection and says so plainly.
 */

import { readAllPages } from "../gov-reports/paging";
import { withDeadline } from "../offline/deadline";
import { isNetworkFailure } from "../offline/network-error";
import {
  restartOnFor,
  ruleFromColumns,
  ruleToColumns,
  validateBillDraft,
  type Bill,
  type BillDraft,
  type BillMark,
  type BillMarkKind,
  type BillPaidFrom,
  type BillPayment,
  type BillStatus,
} from "./bill-schedule";
import {
  EXPENSE_COLUMNS,
  EXPENSE_COPY,
  ExpenseWriteError,
  describeExpenseError,
  toExpense,
  type DbError,
  type ExpenseDb,
  type ExpenseRow,
} from "./expense-service";
import { addDays, todayInManila } from "./manila-date";
import type { Expense } from "./types";

const REQUEST_MS = 15_000;
const PAGE_SIZE = 1000;
/** A store has a handful of bills; the ceiling is reported, never hidden. */
const MAX_BILL_ROWS = 2_000;
/** Marks and payments in one window (a few per bill per month). */
const MAX_EVENT_ROWS = 10_000;
/** Payments are read this far back: the late lookback plus room for the estimate's last 3. */
export const BILL_HISTORY_DAYS = 120;
/** Marks and payments are read this far ahead (the engine lists due dates up to a month ahead). */
export const BILL_LOOKAHEAD_DAYS = 62;

export const BILL_COPY = {
  offline: "No connection. Try again when you're back online.",
  billGone: "That bill isn't available anymore.",
  billStopped: "This bill was stopped, so it stays as it is. Add a new bill instead.",
  dueAlreadyPaid: "That due date is already paid.",
  markGone: "That was already undone.",
  expenseGone: "That expense was voided or isn't available anymore.",
  readFailed: "Your bills could not be read.",
  startTooOld: "Pick a start date within the last 400 days.",
  noDueLeft: "This bill has no due date left before its end date. Pick a later end date, or stop the bill.",
  // Same words as EXPENSE_COPY.bill* (describeExpenseError maps the database's refusals to those).
  pauseInPast: "Pick a day after today.",
  notVisible: "That bill belongs to another branch, so it can't be marked here.",
  otherBranch: "Pay this bill from its own branch.",
} as const;

interface DbAnswer {
  data: unknown;
  error: DbError | null;
}

// ── Errors ────────────────────────────────────────────────────────────────

function textOf(error: DbError | null | undefined): string {
  return `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
}

/** The person's words for a refused bill write. */
export function describeBillError(error: DbError | null | undefined): string {
  const text = textOf(error);
  if (/This bill was stopped/i.test(text)) return BILL_COPY.billStopped;
  if (/expenses_bill_due_recorded_uq/i.test(text)) return BILL_COPY.dueAlreadyPaid;
  // The 20261022150000 refusals (pause_until_past, bill reach) are worded by describeExpenseError.
  return describeExpenseError(error);
}

function toBillError(error: unknown): ExpenseWriteError {
  if (error instanceof ExpenseWriteError) return error;
  if (isNetworkFailure(error)) return new ExpenseWriteError(BILL_COPY.offline, { isNetwork: true });
  const dbError = (error ?? {}) as DbError;
  return new ExpenseWriteError(describeBillError(dbError), { code: dbError.code ?? null });
}

/** A write with a deadline: a thrown network failure becomes an `isNetwork` error. */
async function run(work: PromiseLike<DbAnswer>): Promise<DbAnswer> {
  try {
    return await withDeadline(Promise.resolve(work), REQUEST_MS);
  } catch (error) {
    throw toBillError(error);
  }
}

function readError(error: unknown): Error {
  if (isNetworkFailure(error)) return new Error("No connection. Pull down to try again.");
  const message = (error as DbError | null)?.message;
  return new Error(message ? `${BILL_COPY.readFailed} (${message})` : BILL_COPY.readFailed);
}

/** Exactly one row back, or `refusal` (RLS answered with nothing). */
function single<T>(data: unknown, refusal: string, code = "42501"): T {
  const rows = Array.isArray(data) ? (data as T[]) : [];
  if (rows.length !== 1) throw new ExpenseWriteError(refusal, { code });
  return rows[0];
}

// ── Rows ──────────────────────────────────────────────────────────────────

type Int = number | string;

export interface BillRow {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  name: string;
  category_id: string;
  supplier_id: string | null;
  paid_to_name: string | null;
  paid_from: string;
  amount_cents: Int | null;
  repeat_kind: string;
  repeat_every: Int;
  repeat_days: Int[] | null;
  repeat_weekday: Int | null;
  starts_on: string;
  ends_on: string | null;
  remind_days_before: Int;
  status: string;
  paused_until: string | null;
  /** Added by 20261022150000; the database stamps it. */
  paused_on: string | null;
  created_at: string;
}

export interface BillMarkRow {
  bill_id: string;
  due_on: string;
  kind: string;
  snoozed_until: string | null;
}

export interface BillPaymentRow {
  id: string;
  bill_id: string | null;
  bill_due_on: string | null;
  amount_cents: Int;
  spent_on: string;
}

export const BILL_COLUMNS =
  "id, tenant_id, outlet_id, name, category_id, supplier_id, paid_to_name, paid_from, amount_cents, repeat_kind, " +
  "repeat_every, repeat_days, repeat_weekday, starts_on, ends_on, remind_days_before, status, paused_until, paused_on, created_at";
const MARK_COLUMNS = "bill_id, due_on, kind, snoozed_until";
const PAYMENT_COLUMNS = "id, bill_id, bill_due_on, amount_cents, spent_on";

const toNumber = (value: Int): number => Number(value);

export function toBill(row: BillRow): Bill {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    name: row.name,
    categoryId: row.category_id,
    supplierId: row.supplier_id,
    paidToName: row.paid_to_name,
    paidFrom: row.paid_from as BillPaidFrom,
    amountCents: row.amount_cents === null ? null : toNumber(row.amount_cents),
    // Throws on a row the database's shape CHECK should never have let in.
    rule: ruleFromColumns({
      repeat_kind: row.repeat_kind,
      repeat_every: toNumber(row.repeat_every),
      repeat_days: row.repeat_days === null ? null : row.repeat_days.map(toNumber),
      repeat_weekday: row.repeat_weekday === null ? null : toNumber(row.repeat_weekday),
    }),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    remindDaysBefore: toNumber(row.remind_days_before),
    status: row.status as BillStatus,
    pausedUntil: row.paused_until,
    pausedOn: row.paused_on ?? null,
    createdAt: row.created_at,
  };
}

export function toBillMark(row: BillMarkRow): BillMark {
  return {
    billId: row.bill_id,
    dueOn: row.due_on,
    kind: row.kind === "snoozed" ? "snoozed" : "skipped",
    snoozedUntil: row.snoozed_until,
  };
}

function toBillPayment(row: BillPaymentRow): BillPayment | null {
  if (!row.bill_id || !row.bill_due_on) return null;
  return {
    billId: row.bill_id,
    dueOn: row.bill_due_on,
    expenseId: row.id,
    amountCents: toNumber(row.amount_cents),
    spentOn: row.spent_on,
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────

type Page<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

/** undefined = every bill the caller reaches; null = store-wide only; a uuid = that branch. */
export type BillOutletFilter = string | null | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every bill the caller may see (any status), by name. */
export async function listBills(db: ExpenseDb, tenantId: string, outletId?: BillOutletFilter): Promise<Bill[]> {
  const fetchPage = (start: number, end: number) => {
    let builder = db.from("expense_bills").select(BILL_COLUMNS).eq("tenant_id", tenantId);
    if (outletId === null) builder = builder.is("outlet_id", null);
    // A branch sees its own bills AND the whole store's (rent paid for every branch).
    else if (typeof outletId === "string" && UUID.test(outletId)) builder = builder.or(`outlet_id.eq.${outletId},outlet_id.is.null`);
    return withDeadline(
      Promise.resolve(builder.order("name", { ascending: true }).order("id", { ascending: true }).range(start, end)) as Page<BillRow>,
      REQUEST_MS,
    );
  };
  try {
    const { rows } = await readAllPages<BillRow>(fetchPage, { pageSize: PAGE_SIZE, maxRows: MAX_BILL_ROWS });
    return rows.map(toBill);
  } catch (error) {
    throw readError(error);
  }
}

/** Marks with a due date in [from, to] (Manila). */
export async function listBillMarks(db: ExpenseDb, tenantId: string, from: string, to: string): Promise<BillMark[]> {
  const fetchPage = (start: number, end: number) =>
    withDeadline(
      Promise.resolve(
        db
          .from("expense_bill_marks")
          .select(`id, ${MARK_COLUMNS}`)
          .eq("tenant_id", tenantId)
          .gte("due_on", from)
          .lte("due_on", to)
          .order("due_on", { ascending: true })
          .order("id", { ascending: true })
          .range(start, end),
      ) as Page<BillMarkRow>,
      REQUEST_MS,
    );
  try {
    const { rows } = await readAllPages<BillMarkRow>(fetchPage, { pageSize: PAGE_SIZE, maxRows: MAX_EVENT_ROWS });
    return rows.map(toBillMark);
  } catch (error) {
    throw readError(error);
  }
}

/** Recorded expenses that pay a bill, for due dates in [from, to]. A voided payment frees its date. */
export async function listBillPayments(db: ExpenseDb, tenantId: string, from: string, to: string): Promise<BillPayment[]> {
  const fetchPage = (start: number, end: number) =>
    withDeadline(
      Promise.resolve(
        db
          .from("expenses")
          .select(PAYMENT_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("status", "recorded")
          .not("bill_id", "is", null)
          .gte("bill_due_on", from)
          .lte("bill_due_on", to)
          .order("bill_due_on", { ascending: true })
          .order("id", { ascending: true })
          .range(start, end),
      ) as Page<BillPaymentRow>,
      REQUEST_MS,
    );
  try {
    const { rows } = await readAllPages<BillPaymentRow>(fetchPage, { pageSize: PAGE_SIZE, maxRows: MAX_EVENT_ROWS });
    return rows.flatMap((row) => {
      const payment = toBillPayment(row);
      return payment ? [payment] : [];
    });
  } catch (error) {
    throw readError(error);
  }
}

/** One bill as stored, or null when it is gone or out of the caller's reach. */
export async function readBill(db: ExpenseDb, tenantId: string, billId: string): Promise<Bill | null> {
  const { data, error } = await run(
    db.from("expense_bills").select(BILL_COLUMNS).eq("tenant_id", tenantId).eq("id", billId).limit(1),
  );
  if (error) throw toBillError(error);
  const rows = Array.isArray(data) ? (data as BillRow[]) : [];
  return rows.length === 0 ? null : toBill(rows[0]);
}

/**
 * The latest paid and the latest skipped due date of ONE bill (one row each,
 * indexed on bill + due date), for `restartOnFor` when an edit changes the
 * rule or the start date.
 */
export async function readLastSettlements(
  db: ExpenseDb,
  tenantId: string,
  billId: string,
): Promise<{ payments: BillPayment[]; marks: BillMark[] }> {
  const [paid, skipped] = await Promise.all([
    run(
      db
        .from("expenses")
        .select(PAYMENT_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("bill_id", billId)
        .eq("status", "recorded")
        .order("bill_due_on", { ascending: false })
        .limit(1),
    ),
    run(
      db
        .from("expense_bill_marks")
        .select(`id, ${MARK_COLUMNS}`)
        .eq("tenant_id", tenantId)
        .eq("bill_id", billId)
        .eq("kind", "skipped")
        .order("due_on", { ascending: false })
        .limit(1),
    ),
  ]);
  if (paid.error) throw toBillError(paid.error);
  if (skipped.error) throw toBillError(skipped.error);
  const paidRows = Array.isArray(paid.data) ? (paid.data as BillPaymentRow[]) : [];
  const skippedRows = Array.isArray(skipped.data) ? (skipped.data as BillMarkRow[]) : [];
  return {
    payments: paidRows.flatMap((row) => {
      const payment = toBillPayment(row);
      return payment ? [payment] : [];
    }),
    marks: skippedRows.map(toBillMark),
  };
}

export interface BillBoard {
  bills: Bill[];
  marks: BillMark[];
  payments: BillPayment[];
}

/**
 * Everything "Bills to pay" needs for `today` (Manila): the bills, plus the
 * marks and payments of due dates from BILL_HISTORY_DAYS back to
 * BILL_LOOKAHEAD_DAYS ahead. Feed it to the engine's `billsDue`.
 */
export async function readBillBoard(
  db: ExpenseDb,
  tenantId: string,
  today: string,
  outletId?: BillOutletFilter,
): Promise<BillBoard> {
  const from = addDays(today, -BILL_HISTORY_DAYS);
  const to = addDays(today, BILL_LOOKAHEAD_DAYS);
  const [bills, marks, payments] = await Promise.all([
    listBills(db, tenantId, outletId),
    listBillMarks(db, tenantId, from, to),
    listBillPayments(db, tenantId, from, to),
  ]);
  const billIds = new Set(bills.map((bill) => bill.id));
  return {
    bills,
    marks: marks.filter((mark) => billIds.has(mark.billId)),
    payments: payments.filter((payment) => billIds.has(payment.billId)),
  };
}

// ── Bills ─────────────────────────────────────────────────────────────────

/** What the owner fills in: the engine's draft plus where the bill belongs. */
export interface BillInput extends BillDraft {
  /** null = the whole store. */
  outletId: string | null;
  supplierId?: string | null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/** Validates with the shared engine (same words as the web), then maps to columns. */
function billColumns(input: BillInput, today: string, savedStartsOn: string | null = null): Record<string, unknown> {
  // An edited bill keeps its own start, however old (only a NEW start is bounded).
  const check = validateBillDraft(input, today, { savedStartsOn });
  if (!check.ok) throw new ExpenseWriteError(check.message, { code: "22023" });
  return {
    name: input.name.trim(),
    category_id: input.categoryId,
    outlet_id: input.outletId,
    supplier_id: input.supplierId ?? null,
    paid_to_name: blankToNull(input.paidToName),
    paid_from: input.paidFrom,
    amount_cents: input.amountCents,
    ...ruleToColumns(input.rule),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    remind_days_before: input.remindDaysBefore,
  };
}

/** Adds a bill (active). `today` is Manila's, for the start-date window. */
export async function createBill(db: ExpenseDb, tenantId: string, input: BillInput, today: string): Promise<Bill> {
  const columns = billColumns(input, today);
  const { data, error } = await run(db.from("expense_bills").insert({ ...columns, tenant_id: tenantId }).select(BILL_COLUMNS));
  if (error) throw toBillError(error);
  return toBill(single<BillRow>(data, EXPENSE_COPY.noAccess));
}

async function updateBillRow(db: ExpenseDb, tenantId: string, billId: string, columns: Record<string, unknown>): Promise<Bill> {
  const { data, error } = await run(
    db.from("expense_bills").update(columns).eq("tenant_id", tenantId).eq("id", billId).select(BILL_COLUMNS),
  );
  if (error) throw toBillError(error);
  return toBill(single<BillRow>(data, BILL_COPY.billGone, "P0002"));
}

async function storedBill(db: ExpenseDb, tenantId: string, billId: string): Promise<Bill> {
  const bill = await readBill(db, tenantId, billId);
  if (!bill) throw new ExpenseWriteError(BILL_COPY.billGone, { code: "P0002" });
  return bill;
}

const sameRule = (a: Bill["rule"], b: Bill["rule"]): boolean =>
  JSON.stringify(ruleToColumns(a)) === JSON.stringify(ruleToColumns(b));

/**
 * Edits a bill. Only its next occurrences change; past payments are expenses
 * and stay. The STORED bill is read first: the 400-day start rule is checked
 * against its saved start (a bill running for years keeps its own), and a new
 * rule or start date never re-computes past due dates — the start saved is the
 * next due date under the new rule after today and after the last paid /
 * skipped due date (`restartOnFor`), so rent moved from the 1st to the 5th
 * never shows three late months. `today` is Manila's.
 *
 * `_savedStartsOn` is ignored (kept so older callers still compile): the
 * stored bill is the authority.
 */
export async function updateBill(
  db: ExpenseDb,
  tenantId: string,
  billId: string,
  input: BillInput,
  today: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so older callers compile; the stored bill decides
  _savedStartsOn: string | null = null,
): Promise<Bill> {
  const stored = await storedBill(db, tenantId, billId);
  const check = validateBillDraft(input, today, { savedStartsOn: stored.startsOn });
  if (!check.ok) {
    const message = check.field === "startsOn" ? BILL_COPY.startTooOld : check.message;
    throw new ExpenseWriteError(message, { code: "22023" });
  }
  const columns = billColumns(input, today, stored.startsOn);
  if (input.startsOn !== stored.startsOn || !sameRule(input.rule, stored.rule)) {
    const { payments, marks } = await readLastSettlements(db, tenantId, billId);
    const restartOn = restartOnFor({ id: billId, rule: input.rule, startsOn: input.startsOn, endsOn: input.endsOn }, payments, marks, today);
    if (restartOn === null) throw new ExpenseWriteError(BILL_COPY.noDueLeft, { code: "22023" });
    columns.starts_on = restartOn;
  }
  return updateBillRow(db, tenantId, billId, columns);
}

/**
 * Pauses a bill until a day still ahead (Manila), or until resumed by hand
 * (null). The database stamps `paused_on`.
 */
export function pauseBill(
  db: ExpenseDb,
  tenantId: string,
  billId: string,
  pausedUntil: string | null = null,
  today: string = todayInManila(new Date()),
): Promise<Bill> {
  if (pausedUntil !== null && pausedUntil <= today) {
    return Promise.reject(new ExpenseWriteError(BILL_COPY.pauseInPast, { code: "22023" }));
  }
  return updateBillRow(db, tenantId, billId, { status: "paused", paused_until: pausedUntil });
}

/**
 * Resumes a paused bill from its next due date on (`restartOnFor`), so the
 * months it was paused never come back as late; "every 2 weeks" and "every N
 * months" keep their rhythm. `today` is Manila's.
 */
export async function resumeBill(
  db: ExpenseDb,
  tenantId: string,
  billId: string,
  today: string = todayInManila(new Date()),
): Promise<Bill> {
  const bill = await storedBill(db, tenantId, billId);
  const columns: Record<string, unknown> = { status: "active", paused_until: null };
  if (bill.status === "paused") {
    const restartOn = restartOnFor(bill, [], [], today);
    if (restartOn === null) throw new ExpenseWriteError(BILL_COPY.noDueLeft, { code: "22023" });
    columns.starts_on = restartOn;
  }
  return updateBillRow(db, tenantId, billId, columns);
}

/** Stops a bill for good. Its past payments stay; it never comes back. */
export function endBill(db: ExpenseDb, tenantId: string, billId: string): Promise<Bill> {
  return updateBillRow(db, tenantId, billId, { status: "ended", paused_until: null });
}

// ── Marks ─────────────────────────────────────────────────────────────────

export interface BillMarkInput {
  billId: string;
  dueOn: string;
  kind: BillMarkKind;
  /** Required to snooze ("Remind me tomorrow" = tomorrow); ignored to skip. */
  snoozedUntil?: string | null;
}

/**
 * "Nothing to pay this time" or "Remind me tomorrow" for one due date. A due
 * date holds one mark, so an existing one is replaced in ONE upsert on
 * (bill_id, due_on): a failed write never loses the old mark.
 */
export async function markBill(db: ExpenseDb, tenantId: string, input: BillMarkInput): Promise<BillMark> {
  const snoozedUntil = input.kind === "snoozed" ? (input.snoozedUntil ?? null) : null;
  if (input.kind === "snoozed" && !snoozedUntil) throw new ExpenseWriteError("Pick when to be reminded.");
  const { data, error } = await run(
    db
      .from("expense_bill_marks")
      .upsert(
        { tenant_id: tenantId, bill_id: input.billId, due_on: input.dueOn, kind: input.kind, snoozed_until: snoozedUntil },
        { onConflict: "bill_id,due_on" },
      )
      .select(MARK_COLUMNS),
  );
  if (error) throw toBillError(error);
  return toBillMark(single<BillMarkRow>(data, BILL_COPY.billGone, "P0002"));
}

/** Undo a mark: the due date is open again. */
export async function unmarkBill(db: ExpenseDb, tenantId: string, billId: string, dueOn: string): Promise<void> {
  const { data, error } = await run(
    db.from("expense_bill_marks").delete().eq("tenant_id", tenantId).eq("bill_id", billId).eq("due_on", dueOn).select("id"),
  );
  if (error) throw toBillError(error);
  if (!Array.isArray(data) || data.length === 0) throw new ExpenseWriteError(BILL_COPY.markGone, { code: "P0002" });
}

// ── "I already recorded it" ───────────────────────────────────────────────

async function setExpenseBill(
  db: ExpenseDb,
  tenantId: string,
  expenseId: string,
  link: { bill_id: string | null; bill_due_on: string | null },
): Promise<Expense> {
  const { data, error } = await run(
    db
      .from("expenses")
      .update({ ...link, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", expenseId)
      .eq("status", "recorded")
      .select(EXPENSE_COLUMNS),
  );
  if (error?.code === "23505") throw new ExpenseWriteError(BILL_COPY.dueAlreadyPaid, { code: "23505" });
  if (error) throw toBillError(error);
  return toExpense(single<ExpenseRow>(data, BILL_COPY.expenseGone, "P0002"));
}

/** Files an existing recorded expense as the payment of one due date. Money never changes. */
export function linkExpenseToBill(
  db: ExpenseDb,
  tenantId: string,
  expenseId: string,
  billId: string,
  dueOn: string,
): Promise<Expense> {
  return setExpenseBill(db, tenantId, expenseId, { bill_id: billId, bill_due_on: dueOn });
}

/** Takes the bill link off an expense; the due date is open again. */
export function unlinkExpenseFromBill(db: ExpenseDb, tenantId: string, expenseId: string): Promise<Expense> {
  return setExpenseBill(db, tenantId, expenseId, { bill_id: null, bill_due_on: null });
}
