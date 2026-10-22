/**
 * Reading and writing expenses, straight to the platform database.
 *
 * Like `cash-drawer-service.ts`: RLS and the guard triggers are the boundary
 * (contract §3), the RPCs do anything that touches two rows at once (contract
 * §5), and this module only turns their answers into words a cashier can act
 * on. Every write asserts what it got back — a refusal under RLS is often an
 * empty answer, not an error.
 *
 * The client is injected (`ExpenseDb`) so tests never open a connection;
 * `expense-client.ts` hands screens the live one.
 */

import { readAllPages } from "../gov-reports/paging";
import { withDeadline } from "../offline/deadline";
import { isNetworkFailure } from "../offline/network-error";
import type {
  DrawerExpenseDraft,
  Expense,
  ExpenseCategory,
  ExpenseDraft,
  ExpenseGroup,
  PaidFrom,
  UnsortedPayout,
} from "./types";
import { monthBounds } from "./expense-format";

const REQUEST_MS = 15_000;
const PAGE_SIZE = 1000;
/** A month of a busy café is a few hundred rows; this is the ceiling, reported when hit. */
const MAX_MONTH_ROWS = 10_000;
/** How far back the "to sort" banner looks for old free-text pay-outs. */
export const UNSORTED_LOOKBACK_DAYS = 90;
/** `in (...)` lists are chunked so a URL never grows past what a proxy accepts. */
const IN_CHUNK = 100;

export interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

interface DbAnswer {
  data: unknown;
  error: DbError | null;
}

/**
 * The slice of supabase-js this module uses. Builders are typed loosely on
 * purpose: the app's client is untyped, and every row is mapped below.
 */
export interface ExpenseDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbAnswer>;
}

// ── Errors ────────────────────────────────────────────────────────────────

/** A refusal the person can read; `isNetwork` = it may not have reached the server. */
export class ExpenseWriteError extends Error {
  readonly isNetwork: boolean;
  readonly code: string | null;

  constructor(message: string, options: { isNetwork?: boolean; code?: string | null } = {}) {
    super(message);
    this.name = "ExpenseWriteError";
    this.isNetwork = options.isNetwork ?? false;
    this.code = options.code ?? null;
  }
}

export const EXPENSE_COPY = {
  offline: "No connection. It's saved on this phone and will sync when you're back online.",
  notSetUp: "Expenses aren't switched on for this store yet. Ask the owner to update the app.",
  noAccess: "You don't have access to expenses.",
  drawerNotYours: "You can only pay expenses from your own open drawer.",
  shiftClosed: "This drawer is already closed. Open a drawer first.",
  noteRequired: "Add a note for this category.",
  drawerLocked: "A drawer expense keeps its amount and date. Record a pay in on the drawer to correct the cash.",
  drawerShiftClosed: "This shift is closed, so the cash can't go back into the drawer. Use Fix to change the category instead.",
  alreadyVoided: "That expense was already voided or doesn't exist.",
  missingReference: "That category, supplier or branch is no longer available. Pick another and try again.",
  invalid: "Some details don't add up. Check the amount and the date and try again.",
  billAlreadyPaid: "That bill is already marked paid for this due date. Open Bills to pay to check it.",
  generic: "We couldn't save that. Please try again.",
} as const;

function textOf(error: DbError | null | undefined): string {
  return `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
}

/** The person's words for a database refusal (contract §5 errors). */
export function describeExpenseError(error: DbError | null | undefined, context: "drawer" | "book" = "book"): string {
  const text = textOf(error);
  const code = error?.code ?? "";
  if (/note_required/i.test(text)) return EXPENSE_COPY.noteRequired;
  if (/drawer_shift_closed/i.test(text)) return EXPENSE_COPY.drawerShiftClosed;
  if (/drawer_locked/i.test(text)) return EXPENSE_COPY.drawerLocked;
  // Paying a bill twice for one due date (the partial unique index, bills-contract §2).
  if (/expenses_bill_due_recorded_uq/i.test(text)) return EXPENSE_COPY.billAlreadyPaid;
  if (/already closed|shift is closed|closed shift/i.test(text)) return EXPENSE_COPY.shiftClosed;
  if (code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205") return EXPENSE_COPY.notSetUp;
  if (code === "42501") return context === "drawer" ? EXPENSE_COPY.drawerNotYours : EXPENSE_COPY.noAccess;
  if (code === "P0002") return EXPENSE_COPY.alreadyVoided;
  if (code === "23503") return EXPENSE_COPY.missingReference;
  if (code === "23514" || code === "22023" || code === "22P02") return EXPENSE_COPY.invalid;
  return EXPENSE_COPY.generic;
}

function toWriteError(error: unknown, context: "drawer" | "book" = "book"): ExpenseWriteError {
  if (error instanceof ExpenseWriteError) return error;
  if (isNetworkFailure(error)) return new ExpenseWriteError(EXPENSE_COPY.offline, { isNetwork: true });
  const dbError = (error ?? {}) as DbError;
  return new ExpenseWriteError(describeExpenseError(dbError, context), { code: dbError.code ?? null });
}

/** Runs a request with a deadline; a thrown network failure becomes an `isNetwork` error. */
async function run(work: PromiseLike<DbAnswer>, context: "drawer" | "book" = "book"): Promise<DbAnswer> {
  try {
    return await withDeadline(Promise.resolve(work), REQUEST_MS);
  } catch (error) {
    throw toWriteError(error, context);
  }
}

function readError(error: DbError, fallback: string): Error {
  if (isNetworkFailure(error)) return new Error("No connection. Pull down to try again.");
  const known = describeExpenseError(error);
  return new Error(known === EXPENSE_COPY.generic ? `${fallback} (${error.message ?? "unknown"})` : known);
}

// ── Rows ──────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  tenant_id: string;
  system_key: string | null;
  name: string;
  icon: string | null;
  grp: string;
  needs_note: boolean | null;
  sort_order: number | null;
  archived_at: string | null;
}

const CATEGORY_COLUMNS = "id, tenant_id, system_key, name, icon, grp, needs_note, sort_order, archived_at";

export function toCategory(row: CategoryRow): ExpenseCategory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    systemKey: row.system_key,
    name: row.name,
    icon: row.icon,
    group: row.grp as ExpenseGroup,
    needsNote: row.needs_note === true,
    sortOrder: row.sort_order ?? 0,
    archivedAt: row.archived_at,
  };
}

export interface ExpenseRow {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  category_id: string;
  supplier_id: string | null;
  paid_to_name: string | null;
  staff_user_id: string | null;
  note: string | null;
  amount_cents: number | string;
  spent_on: string;
  paid_from: string;
  shift_cash_movement_id: string | null;
  is_stock_purchase: boolean | null;
  doc_type: string | null;
  invoice_no: string | null;
  supplier_tin: string | null;
  vat_cents: number | string | null;
  ewt_cents: number | string | null;
  ewt_rate: number | string | null;
  form_2307_given: boolean | null;
  status: string;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  replaces_expense_id: string | null;
  client_request_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  /** Bills to pay (20261022140000); optional so a narrower select still maps. */
  bill_id?: string | null;
  bill_due_on?: string | null;
  expense_receipts?: { count: number }[] | null;
}

export const EXPENSE_COLUMNS =
  "id, tenant_id, outlet_id, category_id, supplier_id, paid_to_name, staff_user_id, note, amount_cents, spent_on, " +
  "paid_from, shift_cash_movement_id, is_stock_purchase, doc_type, invoice_no, supplier_tin, vat_cents, ewt_cents, " +
  "ewt_rate, form_2307_given, status, void_reason, voided_by, voided_at, replaces_expense_id, client_request_id, " +
  "created_by, created_by_name, created_at, bill_id, bill_due_on, expense_receipts(count)";

function nullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    categoryId: row.category_id,
    supplierId: row.supplier_id,
    paidToName: row.paid_to_name,
    staffUserId: row.staff_user_id,
    note: row.note,
    amountCents: Number(row.amount_cents),
    spentOn: row.spent_on,
    paidFrom: row.paid_from as PaidFrom,
    shiftCashMovementId: row.shift_cash_movement_id,
    isStockPurchase: row.is_stock_purchase === true,
    docType: (row.doc_type as Expense["docType"]) ?? null,
    invoiceNo: row.invoice_no,
    supplierTin: row.supplier_tin,
    vatCents: nullableNumber(row.vat_cents),
    ewtCents: nullableNumber(row.ewt_cents),
    ewtRate: nullableNumber(row.ewt_rate),
    form2307Given: row.form_2307_given === true,
    status: row.status === "void" ? "void" : "recorded",
    voidReason: row.void_reason,
    voidedBy: row.voided_by,
    voidedAt: row.voided_at,
    replacesExpenseId: row.replaces_expense_id,
    clientRequestId: row.client_request_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? "Staff",
    createdAt: row.created_at,
    receiptCount: row.expense_receipts?.[0]?.count ?? 0,
    billId: row.bill_id ?? null,
    billDueOn: row.bill_due_on ?? null,
  };
}

// ── Categories ────────────────────────────────────────────────────────────

async function selectCategories(db: ExpenseDb, tenantId: string): Promise<ExpenseCategory[]> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("expense_categories")
        .select(CATEGORY_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ) as Promise<DbAnswer>,
    REQUEST_MS,
  );
  if (error) throw readError(error, "The expense categories could not be read.");
  return ((data ?? []) as CategoryRow[]).map(toCategory);
}

/**
 * The store's live categories. A store that has none yet gets the seed list
 * first (`ensure_expense_categories` is idempotent), so a first-time cashier
 * never meets an empty picker.
 */
export async function listCategories(db: ExpenseDb, tenantId: string): Promise<ExpenseCategory[]> {
  const first = await selectCategories(db, tenantId);
  if (first.length > 0) return first;
  const { error } = await withDeadline(
    Promise.resolve(db.rpc("ensure_expense_categories", { p_tenant_id: tenantId })),
    REQUEST_MS,
  );
  if (error) throw readError(error, "The expense categories could not be set up.");
  return selectCategories(db, tenantId);
}

// ── Reads ─────────────────────────────────────────────────────────────────

export interface ExpenseListQuery {
  tenantId: string;
  /** `YYYY-MM`, Manila. */
  month: string;
  /** undefined = every row the caller may read; null = store-wide rows only; a uuid = that branch. */
  outletId?: string | null;
}

export interface ExpenseMonth {
  expenses: Expense[];
  /** True when the month held more rows than the ceiling: totals are then partial. */
  isTruncated: boolean;
}

/** One month's expenses (voided rows included, so a fix stays visible), newest first. */
export async function listExpenses(db: ExpenseDb, query: ExpenseListQuery): Promise<ExpenseMonth> {
  const { from, to } = monthBounds(query.month);
  const fetchPage = (start: number, end: number) => {
    let builder = db
      .from("expenses")
      .select(EXPENSE_COLUMNS)
      .eq("tenant_id", query.tenantId)
      .gte("spent_on", from)
      .lte("spent_on", to);
    if (query.outletId === null) builder = builder.is("outlet_id", null);
    else if (typeof query.outletId === "string") builder = builder.eq("outlet_id", query.outletId);
    return withDeadline(
      Promise.resolve(
        builder
          .order("spent_on", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(start, end),
      ) as Promise<{ data: ExpenseRow[] | null; error: { message: string } | null }>,
      REQUEST_MS,
    );
  };
  try {
    const { rows, isTruncated } = await readAllPages<ExpenseRow>(fetchPage, {
      pageSize: PAGE_SIZE,
      maxRows: MAX_MONTH_ROWS,
    });
    return { expenses: rows.map(toExpense), isTruncated };
  } catch (error) {
    throw readError(error as DbError, "The expenses could not be read.");
  }
}

/** How many recent rows feed the repeat chips and the category ranking. */
export const RECENT_EXPENSE_LIMIT = 300;

/**
 * The newest expenses since `sinceDate` (bounded), for the repeat chips and
 * the picker's "most used". A cashier without `expenses` reads only their own
 * drawer rows here — which is exactly what their chips should come from.
 */
export async function listRecentExpenses(db: ExpenseDb, tenantId: string, sinceDate: string): Promise<Expense[]> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("expenses")
        .select(EXPENSE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("status", "recorded")
        .gte("spent_on", sinceDate)
        .order("created_at", { ascending: false })
        .limit(RECENT_EXPENSE_LIMIT),
    ) as Promise<DbAnswer>,
    REQUEST_MS,
  );
  if (error) throw readError(error, "Recent expenses could not be read.");
  return ((data ?? []) as ExpenseRow[]).map(toExpense);
}

/**
 * Whether this store counts stock: it has at least one recipe, so sales
 * deduct ingredients (plan §2.2). Only then is "Did this go into your stock
 * count?" asked. A failed read answers false — the question is skipped, never
 * forced on a store that may not track anything.
 */
export async function storeTracksStock(db: ExpenseDb, tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await withDeadline(
      Promise.resolve(db.from("recipes").select("id").eq("tenant_id", tenantId).limit(1)) as Promise<DbAnswer>,
      REQUEST_MS,
    );
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export interface ExpenseReceiptRef {
  id: string;
  mime: string;
  createdAt: string;
}

export interface ExpenseDetail {
  expense: Expense;
  receipts: ExpenseReceiptRef[];
  /** The row this one replaced, if it is a fix. */
  replaces: Expense | null;
  /** The row that replaced this one, if it was fixed. */
  replacedBy: Expense | null;
  /** For a drawer row: its shift, and whether voiding can still put the cash back. */
  drawer: { shiftId: string; drawerName: string | null; isShiftOpen: boolean } | null;
}

async function readDrawerOf(db: ExpenseDb, tenantId: string, movementId: string): Promise<ExpenseDetail["drawer"]> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db.from("shift_cash_movements").select("shift_id").eq("tenant_id", tenantId).eq("id", movementId).limit(1),
    ) as Promise<DbAnswer>,
    REQUEST_MS,
  );
  const shiftId = !error ? ((data ?? []) as { shift_id: string }[])[0]?.shift_id : undefined;
  if (!shiftId) return null;
  const shift = await withDeadline(
    Promise.resolve(
      db.from("staff_shifts").select("status, drawer_name").eq("tenant_id", tenantId).eq("id", shiftId).limit(1),
    ) as Promise<DbAnswer>,
    REQUEST_MS,
  );
  const row = !shift.error ? ((shift.data ?? []) as { status: string; drawer_name: string | null }[])[0] : undefined;
  // Unreadable shift: assume closed, so Void is never offered where it would be refused.
  return { shiftId, drawerName: row?.drawer_name ?? null, isShiftOpen: row?.status === "open" };
}

async function selectOneExpense(db: ExpenseDb, tenantId: string, column: string, value: string): Promise<Expense | null> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db.from("expenses").select(EXPENSE_COLUMNS).eq("tenant_id", tenantId).eq(column, value).limit(1),
    ) as Promise<DbAnswer>,
    REQUEST_MS,
  );
  if (error) throw readError(error, "The expense could not be read.");
  const rows = (data ?? []) as ExpenseRow[];
  return rows.length > 0 ? toExpense(rows[0]) : null;
}

/** One expense with its receipts and its place in a fix chain. Null = gone or not yours to read. */
export async function getExpense(db: ExpenseDb, tenantId: string, expenseId: string): Promise<ExpenseDetail | null> {
  const expense = await selectOneExpense(db, tenantId, "id", expenseId);
  if (!expense) return null;
  const [receiptAnswer, replaces, replacedBy, drawer] = await Promise.all([
    withDeadline(
      Promise.resolve(
        db
          .from("expense_receipts")
          .select("id, mime, created_at")
          .eq("tenant_id", tenantId)
          .eq("expense_id", expenseId)
          .order("created_at", { ascending: true }),
      ) as Promise<DbAnswer>,
      REQUEST_MS,
    ),
    expense.replacesExpenseId ? selectOneExpense(db, tenantId, "id", expense.replacesExpenseId) : Promise.resolve(null),
    expense.status === "void"
      ? selectOneExpense(db, tenantId, "replaces_expense_id", expense.id)
      : Promise.resolve(null),
    expense.shiftCashMovementId
      ? readDrawerOf(db, tenantId, expense.shiftCashMovementId).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (receiptAnswer.error) throw readError(receiptAnswer.error, "The receipts could not be read.");
  const receipts = ((receiptAnswer.data ?? []) as { id: string; mime: string; created_at: string }[]).map((row) => ({
    id: row.id,
    mime: row.mime,
    createdAt: row.created_at,
  }));
  return { expense, receipts, replaces, replacedBy, drawer };
}

/** The server id of a row recorded with this request id; null = not there (yet), or not readable. */
export async function findExpenseIdByRequest(
  db: ExpenseDb,
  tenantId: string,
  clientRequestId: string,
): Promise<string | null> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("expenses")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("client_request_id", clientRequestId)
        .limit(1),
    ) as Promise<DbAnswer>,
    REQUEST_MS,
  );
  if (error) throw toWriteError(error);
  const rows = (data ?? []) as { id: string }[];
  return rows[0]?.id ?? null;
}

interface MovementRow {
  id: string;
  shift_id: string;
  outlet_id: string | null;
  amount: number | string;
  reason: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Movement id → the expense that sorted it (its category, group and status). */
export interface MovementLink {
  expenseId: string;
  categoryId: string;
  categoryName: string | null;
  group: ExpenseGroup | null;
  /** `void` = the expense was undone (a pay-in put the cash back) or replaced by nothing readable. */
  status: "recorded" | "void";
}

interface LinkRow {
  id: string;
  shift_cash_movement_id: string | null;
  category_id: string;
  status: string;
  expense_categories: { name: string; grp: string } | { name: string; grp: string }[] | null;
}

/**
 * Which of these pay-outs carry an expense row, of ANY status: a pay-out once
 * sorted is never "to sort" again, even if that expense was voided. When a
 * fix left several rows on one pay-out, the recorded one wins. A cashier can
 * read their own drawer rows (contract §3), so this also serves the shift card.
 */
export async function listMovementLinks(
  db: ExpenseDb,
  tenantId: string,
  movementIds: readonly string[],
): Promise<Map<string, MovementLink>> {
  const links = new Map<string, MovementLink>();
  for (const ids of chunk([...new Set(movementIds)], IN_CHUNK)) {
    const { data, error } = await withDeadline(
      Promise.resolve(
        db
          .from("expenses")
          .select("id, shift_cash_movement_id, category_id, status, expense_categories(name, grp)")
          .eq("tenant_id", tenantId)
          .in("shift_cash_movement_id", ids),
      ) as Promise<DbAnswer>,
      REQUEST_MS,
    );
    if (error) throw readError(error, "The drawer's expenses could not be read.");
    for (const row of (data ?? []) as LinkRow[]) {
      if (!row.shift_cash_movement_id) continue;
      const existing = links.get(row.shift_cash_movement_id);
      if (existing?.status === "recorded") continue;
      const category = Array.isArray(row.expense_categories) ? row.expense_categories[0] : row.expense_categories;
      links.set(row.shift_cash_movement_id, {
        expenseId: row.id,
        categoryId: row.category_id,
        categoryName: category?.name ?? null,
        group: (category?.grp as ExpenseGroup | undefined) ?? null,
        status: row.status === "void" ? "void" : "recorded",
      });
    }
  }
  return links;
}

/**
 * Drawer pay-outs recorded without a category — by older app builds, or before
 * this store had expenses. Newest first. Needs `expenses` to see other people's.
 */
export async function listUnsortedPayouts(
  db: ExpenseDb,
  tenantId: string,
  now: number = Date.now(),
): Promise<UnsortedPayout[]> {
  const since = new Date(now - UNSORTED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const fetchPage = (start: number, end: number) =>
    withDeadline(
      Promise.resolve(
        db
          .from("shift_cash_movements")
          .select("id, shift_id, outlet_id, amount, reason, recorded_by_name, created_at")
          .eq("tenant_id", tenantId)
          .eq("kind", "pay_out")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(start, end),
      ) as Promise<{ data: MovementRow[] | null; error: { message: string } | null }>,
      REQUEST_MS,
    );
  let movements: MovementRow[];
  try {
    movements = (await readAllPages<MovementRow>(fetchPage, { pageSize: PAGE_SIZE, maxRows: 5000 })).rows;
  } catch (error) {
    throw readError(error as DbError, "The drawer pay-outs could not be read.");
  }
  if (movements.length === 0) return [];
  const links = await listMovementLinks(db, tenantId, movements.map((m) => m.id));
  return movements
    .filter((movement) => !links.has(movement.id))
    .map((movement) => ({
      movementId: movement.id,
      shiftId: movement.shift_id,
      outletId: movement.outlet_id,
      amountCents: Math.round(Number(movement.amount) * 100),
      reason: movement.reason ?? "",
      recordedByName: movement.recorded_by_name ?? "Staff",
      createdAt: movement.created_at,
    }));
}

// ── Writes ────────────────────────────────────────────────────────────────

function isRequestConflict(error: DbError | null): boolean {
  return error?.code === "23505" && /client_request/i.test(textOf(error));
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Record a NON-drawer expense. Replays are safe: the request id is unique per
 * store, so a second insert of the same entry answers with the first row's id.
 */
export async function recordExpense(
  db: ExpenseDb,
  tenantId: string,
  draft: ExpenseDraft,
  createdByName: string,
): Promise<string> {
  const { data, error } = await run(
    db
      .from("expenses")
      .insert({
        tenant_id: tenantId,
        outlet_id: draft.outletId,
        category_id: draft.categoryId,
        amount_cents: draft.amountCents,
        spent_on: draft.spentOn,
        paid_from: draft.paidFrom,
        note: blankToNull(draft.note),
        supplier_id: draft.supplierId ?? null,
        paid_to_name: blankToNull(draft.paidToName),
        is_stock_purchase: draft.isStockPurchase === true,
        client_request_id: draft.clientRequestId,
        created_by_name: createdByName.slice(0, 80) || "Staff",
        // Paying a bill: both or neither (the database's expenses_bill_pair_ck).
        bill_id: draft.billId ?? null,
        bill_due_on: draft.billDueOn ?? null,
      })
      .select("id")
      .single(),
  );
  if (isRequestConflict(error)) {
    const existing = await findExpenseIdByRequest(db, tenantId, draft.clientRequestId);
    if (existing) return existing;
    throw new ExpenseWriteError(EXPENSE_COPY.generic, { code: "23505" });
  }
  if (error) throw toWriteError(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new ExpenseWriteError(EXPENSE_COPY.noAccess, { code: "42501" });
  return id;
}

export interface DrawerExpenseInput extends DrawerExpenseDraft {
  recordedByName: string;
}

/** Pay an expense from an open drawer: the pay-out and the expense in one transaction. */
export async function recordDrawerExpense(db: ExpenseDb, input: DrawerExpenseInput): Promise<string> {
  const { data, error } = await run(
    db.rpc("record_drawer_expense", {
      p_shift_id: input.shiftId,
      p_amount_cents: input.amountCents,
      p_category_id: input.categoryId,
      p_note: blankToNull(input.note),
      p_supplier_id: input.supplierId ?? null,
      p_paid_to_name: blankToNull(input.paidToName),
      p_recorded_by_name: input.recordedByName.slice(0, 80) || "Staff",
      p_client_request_id: input.clientRequestId,
    }),
    "drawer",
  );
  if (error) throw toWriteError(error, "drawer");
  if (typeof data !== "string" || !data) throw new ExpenseWriteError(EXPENSE_COPY.drawerNotYours, { code: "42501" });
  return data;
}

export interface SortPayoutInput {
  movementId: string;
  categoryId: string;
  note?: string | null;
  supplierId?: string | null;
  paidToName?: string | null;
  recordedByName: string;
}

/** Give an old free-text pay-out its category. Nothing existing is updated. */
export async function sortDrawerPayout(db: ExpenseDb, input: SortPayoutInput): Promise<string> {
  const { data, error } = await run(
    db.rpc("sort_drawer_payout", {
      p_movement_id: input.movementId,
      p_category_id: input.categoryId,
      p_note: blankToNull(input.note),
      p_supplier_id: input.supplierId ?? null,
      p_paid_to_name: blankToNull(input.paidToName),
      p_recorded_by_name: input.recordedByName.slice(0, 80) || "Staff",
    }),
  );
  if (error?.code === "23505") throw new ExpenseWriteError("That pay-out was already sorted.", { code: "23505" });
  if (error) throw toWriteError(error);
  if (typeof data !== "string" || !data) throw new ExpenseWriteError(EXPENSE_COPY.noAccess, { code: "42501" });
  return data;
}

export const VOID_REASON_MAX = 200;

function checkReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new ExpenseWriteError("Say why — a short reason is enough.");
  if (trimmed.length > VOID_REASON_MAX) throw new ExpenseWriteError(`Keep the reason under ${VOID_REASON_MAX} characters.`);
  return trimmed;
}

/**
 * Void a recorded expense. The row stays, struck through, with the reason.
 * A DRAWER expense on a still-open shift also puts the cash back: the RPC
 * records a pay-in for the same amount (`actorName` names it), so the cashier
 * who paid it may undo it on their own open shift. On a closed shift it is
 * refused (`drawer_shift_closed`) — Fix re-sorts it instead.
 */
export async function voidExpense(db: ExpenseDb, expenseId: string, reason: string, actorName?: string): Promise<void> {
  const args: Record<string, unknown> = { p_expense_id: expenseId, p_reason: checkReason(reason) };
  if (actorName) args.p_actor_name = actorName.slice(0, 80);
  const { error } = await run(db.rpc("void_expense", args));
  if (error) throw toWriteError(error);
}

/** Fields a fix may change (contract §5 `replace_expense`), in database names. */
export interface ExpensePatch {
  category_id?: string;
  amount_cents?: number;
  spent_on?: string;
  paid_from?: Exclude<PaidFrom, "drawer">;
  note?: string | null;
  paid_to_name?: string | null;
  is_stock_purchase?: boolean;
}

/** Fields a drawer row may not change (`drawer_locked`). */
const DRAWER_LOCKED_KEYS: readonly (keyof ExpensePatch)[] = ["amount_cents", "spent_on", "paid_from"];

/** Fix = void + a corrected copy. Returns the new row's id. */
export async function replaceExpense(
  db: ExpenseDb,
  original: Pick<Expense, "id" | "paidFrom">,
  reason: string,
  patch: ExpensePatch,
): Promise<string> {
  if (original.paidFrom === "drawer" && DRAWER_LOCKED_KEYS.some((key) => key in patch)) {
    throw new ExpenseWriteError(EXPENSE_COPY.drawerLocked, { code: "22023" });
  }
  if (Object.keys(patch).length === 0) throw new ExpenseWriteError("Nothing changed.");
  const { data, error } = await run(
    db.rpc("replace_expense", { p_expense_id: original.id, p_reason: checkReason(reason), p_patch: patch }),
  );
  if (error) throw toWriteError(error);
  if (typeof data !== "string" || !data) throw new ExpenseWriteError(EXPENSE_COPY.alreadyVoided, { code: "P0002" });
  return data;
}
