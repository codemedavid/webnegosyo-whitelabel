import {
  BILL_COPY,
  createBill,
  describeBillError,
  endBill,
  linkExpenseToBill,
  listBillPayments,
  listBills,
  markBill,
  pauseBill,
  readBillBoard,
  resumeBill,
  toBill,
  unlinkExpenseFromBill,
  unmarkBill,
  updateBill,
  type BillInput,
  type BillRow,
} from "./bills-service";
import { EXPENSE_COPY, ExpenseWriteError, recordExpense, toExpense, type ExpenseDb, type ExpenseRow } from "./expense-service";

interface Answer {
  data: unknown;
  error: { code?: string; message?: string; details?: string } | null;
}

interface Call {
  table: string;
  ops: [string, unknown[]][];
}

const BUILDER_METHODS = ["select", "insert", "update", "delete", "eq", "is", "not", "in", "gte", "lte", "order", "range", "limit", "single"];

/** A chainable stand-in for supabase-js: awaiting a builder takes the table's next scripted answer. */
function fakeDb(script: Record<string, Answer[]>) {
  const calls: Call[] = [];
  const db: ExpenseDb = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const name of BUILDER_METHODS) {
        builder[name] = (...args: unknown[]) => {
          call.ops.push([name, args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) => {
        const next = script[table]?.shift() ?? { data: [], error: null };
        return Promise.resolve(next).then(resolve, reject);
      };
      return builder;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  const opsOf = (method: string) => calls.flatMap((call) => call.ops.filter(([name]) => name === method).map(([, args]) => args));
  return { db, calls, opsOf };
}

const TODAY = "2026-10-22";

const billRow = (overrides: Partial<BillRow> = {}): BillRow => ({
  id: "b1",
  tenant_id: "t1",
  outlet_id: null,
  name: "Rent",
  category_id: "c-rent",
  supplier_id: null,
  paid_to_name: "Aling Nena",
  paid_from: "bank",
  amount_cents: "1500000",
  repeat_kind: "monthly",
  repeat_every: 1,
  repeat_days: [5],
  repeat_weekday: null,
  starts_on: "2026-10-01",
  ends_on: null,
  remind_days_before: 3,
  status: "active",
  paused_until: null,
  created_at: "2026-10-22T01:00:00Z",
  ...overrides,
});

const input = (overrides: Partial<BillInput> = {}): BillInput => ({
  name: "  Rent ",
  categoryId: "c-rent",
  amountCents: 1_500_000,
  rule: { kind: "monthly", day: 5 },
  startsOn: "2026-10-01",
  endsOn: null,
  remindDaysBefore: 3,
  paidFrom: "bank",
  paidToName: "  ",
  outletId: null,
  ...overrides,
});

const expenseRow = (overrides: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: "e1",
  tenant_id: "t1",
  outlet_id: null,
  category_id: "c-rent",
  supplier_id: null,
  paid_to_name: null,
  staff_user_id: null,
  note: null,
  amount_cents: 1_500_000,
  spent_on: "2026-10-05",
  paid_from: "bank",
  shift_cash_movement_id: null,
  is_stock_purchase: false,
  doc_type: null,
  invoice_no: null,
  supplier_tin: null,
  vat_cents: null,
  ewt_cents: null,
  ewt_rate: null,
  form_2307_given: false,
  status: "recorded",
  void_reason: null,
  voided_by: null,
  voided_at: null,
  replaces_expense_id: null,
  client_request_id: null,
  created_by: "u1",
  created_by_name: "Ana",
  created_at: "2026-10-05T02:00:00Z",
  ...overrides,
});

describe("toBill", () => {
  it("maps columns to the engine's rule (0 = last day) and string numbers to numbers", () => {
    const bill = toBill(billRow({ repeat_kind: "twice_monthly", repeat_days: ["15", 0], amount_cents: null }));
    expect(bill.rule).toEqual({ kind: "twice_monthly", days: [15, "last"] });
    expect(bill.amountCents).toBeNull();
    expect(toBill(billRow()).amountCents).toBe(1_500_000);
  });

  it("refuses a row the shape CHECK should never have let in", () => {
    expect(() => toBill(billRow({ repeat_days: null }))).toThrow(/Impossible bill rule/);
  });
});

describe("reads", () => {
  it("lists bills by name, paged, with the branch filter", async () => {
    const { db, opsOf } = fakeDb({ expense_bills: [{ data: [billRow()], error: null }] });
    const bills = await listBills(db, "t1", "o1");
    expect(bills.map((bill) => bill.id)).toEqual(["b1"]);
    expect(opsOf("eq")).toEqual(expect.arrayContaining([["tenant_id", "t1"], ["outlet_id", "o1"]]));
    expect(opsOf("range")).toEqual([[0, 999]]);
  });

  it("store-wide only filters outlet_id IS NULL", async () => {
    const { db, opsOf } = fakeDb({ expense_bills: [{ data: [], error: null }] });
    await listBills(db, "t1", null);
    expect(opsOf("is")).toEqual([["outlet_id", null]]);
  });

  it("reads only recorded, linked payments in the due-date window", async () => {
    const { db, opsOf } = fakeDb({
      expenses: [{ data: [{ id: "e1", bill_id: "b1", bill_due_on: "2026-10-05", amount_cents: "1500000", spent_on: "2026-10-04" }], error: null }],
    });
    const payments = await listBillPayments(db, "t1", "2026-07-01", "2026-12-31");
    expect(payments).toEqual([{ billId: "b1", dueOn: "2026-10-05", expenseId: "e1", amountCents: 1_500_000, spentOn: "2026-10-04" }]);
    expect(opsOf("eq")).toEqual(expect.arrayContaining([["status", "recorded"]]));
    expect(opsOf("not")).toEqual([["bill_id", "is", null]]);
    expect(opsOf("gte")).toEqual([["bill_due_on", "2026-07-01"]]);
  });

  it("the board keeps only marks and payments of bills the caller can see, around today", async () => {
    const { db, opsOf } = fakeDb({
      expense_bills: [{ data: [billRow()], error: null }],
      expense_bill_marks: [{
        data: [
          { bill_id: "b1", due_on: "2026-11-05", kind: "snoozed", snoozed_until: "2026-11-06" },
          { bill_id: "hidden", due_on: "2026-11-05", kind: "skipped", snoozed_until: null },
        ],
        error: null,
      }],
      expenses: [{ data: [], error: null }],
    });
    const board = await readBillBoard(db, "t1", TODAY);
    expect(board.marks).toEqual([{ billId: "b1", dueOn: "2026-11-05", kind: "snoozed", snoozedUntil: "2026-11-06" }]);
    expect(opsOf("gte")).toEqual(expect.arrayContaining([["due_on", "2026-06-24"], ["bill_due_on", "2026-06-24"]]));
    expect(opsOf("lte")).toEqual(expect.arrayContaining([["due_on", "2026-12-23"]]));
  });

  it("a failed read says so in plain words", async () => {
    const { db } = fakeDb({ expense_bills: [{ data: null, error: { message: "boom" } }] });
    await expect(listBills(db, "t1")).rejects.toThrow(`${BILL_COPY.readFailed} (boom)`);
  });
});

describe("bills", () => {
  it("validates with the shared engine before writing", async () => {
    const { db, calls } = fakeDb({});
    await expect(createBill(db, "t1", input({ name: " " }), TODAY)).rejects.toThrow("Give the bill a name");
    await expect(createBill(db, "t1", input({ paidFrom: "drawer" }), TODAY)).rejects.toThrow("drawer");
    expect(calls).toHaveLength(0);
  });

  it("creates a bill with the rule as columns", async () => {
    const { db, opsOf } = fakeDb({ expense_bills: [{ data: [billRow()], error: null }] });
    const bill = await createBill(db, "t1", input({ rule: { kind: "twice_monthly", days: [15, "last"] } }), TODAY);
    expect(bill.id).toBe("b1");
    expect(opsOf("insert")[0][0]).toMatchObject({
      tenant_id: "t1",
      name: "Rent",
      paid_to_name: null,
      repeat_kind: "twice_monthly",
      repeat_every: 1,
      repeat_days: [15, 0],
      repeat_weekday: null,
    });
  });

  it("an insert that returns no row is refused (RLS is silent)", async () => {
    const { db } = fakeDb({ expense_bills: [{ data: [], error: null }] });
    await expect(createBill(db, "t1", input(), TODAY)).rejects.toThrow(EXPENSE_COPY.noAccess);
  });

  it("an edit that matches nothing says the bill is gone", async () => {
    const { db } = fakeDb({ expense_bills: [{ data: [], error: null }] });
    await expect(updateBill(db, "t1", "b1", input(), TODAY)).rejects.toThrow(BILL_COPY.billGone);
  });

  it("pause, resume and end write only the status columns", async () => {
    const { db, opsOf } = fakeDb({
      expense_bills: [
        { data: [billRow({ status: "paused", paused_until: "2026-12-01" })], error: null },
        { data: [billRow()], error: null },
        { data: [billRow({ status: "ended" })], error: null },
      ],
    });
    expect((await pauseBill(db, "t1", "b1", "2026-12-01")).status).toBe("paused");
    expect((await resumeBill(db, "t1", "b1")).status).toBe("active");
    expect((await endBill(db, "t1", "b1")).status).toBe("ended");
    expect(opsOf("update").map(([columns]) => columns)).toEqual([
      { status: "paused", paused_until: "2026-12-01" },
      { status: "active", paused_until: null },
      { status: "ended", paused_until: null },
    ]);
  });

  it("a stopped bill stays as it is", async () => {
    const { db } = fakeDb({ expense_bills: [{ data: null, error: { code: "42501", message: "This bill was stopped and cannot change" } }] });
    await expect(resumeBill(db, "t1", "b1")).rejects.toThrow(BILL_COPY.billStopped);
  });

  it("a network failure is reported as offline", async () => {
    const db: ExpenseDb = {
      from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: () => Promise.reject(new TypeError("Network request failed")) }) }) }) }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    const error = await endBill(db, "t1", "b1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ExpenseWriteError);
    expect((error as ExpenseWriteError).isNetwork).toBe(true);
    expect((error as Error).message).toBe(BILL_COPY.offline);
  });
});

describe("marks", () => {
  it("replaces any mark on the due date, then inserts the new one", async () => {
    const { db, calls, opsOf } = fakeDb({
      expense_bill_marks: [
        { data: null, error: null },
        { data: [{ bill_id: "b1", due_on: "2026-10-05", kind: "snoozed", snoozed_until: "2026-10-23" }], error: null },
      ],
    });
    const mark = await markBill(db, "t1", { billId: "b1", dueOn: "2026-10-05", kind: "snoozed", snoozedUntil: "2026-10-23" });
    expect(mark).toEqual({ billId: "b1", dueOn: "2026-10-05", kind: "snoozed", snoozedUntil: "2026-10-23" });
    expect(calls.map((call) => call.ops[0][0])).toEqual(["delete", "insert"]);
    expect(opsOf("insert")[0][0]).toEqual({ tenant_id: "t1", bill_id: "b1", due_on: "2026-10-05", kind: "snoozed", snoozed_until: "2026-10-23" });
  });

  it("a skip never carries a reminder date, and a snooze needs one", async () => {
    const { db, opsOf } = fakeDb({
      expense_bill_marks: [{ data: null, error: null }, { data: [{ bill_id: "b1", due_on: "2026-10-05", kind: "skipped", snoozed_until: null }], error: null }],
    });
    await markBill(db, "t1", { billId: "b1", dueOn: "2026-10-05", kind: "skipped", snoozedUntil: "2026-10-23" });
    expect(opsOf("insert")[0][0]).toMatchObject({ kind: "skipped", snoozed_until: null });
    await expect(markBill(db, "t1", { billId: "b1", dueOn: "2026-10-05", kind: "snoozed" })).rejects.toThrow("Pick when to be reminded.");
  });

  it("a mark that comes back empty is refused", async () => {
    const { db } = fakeDb({ expense_bill_marks: [{ data: null, error: null }, { data: [], error: null }] });
    await expect(markBill(db, "t1", { billId: "b1", dueOn: "2026-10-05", kind: "skipped" })).rejects.toThrow(BILL_COPY.billGone);
  });

  it("an undo that deleted nothing was already undone", async () => {
    const { db } = fakeDb({ expense_bill_marks: [{ data: [], error: null }] });
    await expect(unmarkBill(db, "t1", "b1", "2026-10-05")).rejects.toThrow(BILL_COPY.markGone);
  });

  it("an undo deletes the mark of that due date", async () => {
    const { db, opsOf } = fakeDb({ expense_bill_marks: [{ data: [{ id: "m1" }], error: null }] });
    await unmarkBill(db, "t1", "b1", "2026-10-05");
    expect(opsOf("eq")).toEqual([["tenant_id", "t1"], ["bill_id", "b1"], ["due_on", "2026-10-05"]]);
  });
});

describe('"I already recorded it"', () => {
  it("links a recorded expense to a due date", async () => {
    const { db, opsOf } = fakeDb({ expenses: [{ data: [expenseRow({ bill_id: "b1", bill_due_on: "2026-10-05" })], error: null }] });
    const expense = await linkExpenseToBill(db, "t1", "e1", "b1", "2026-10-05");
    expect(expense).toMatchObject({ billId: "b1", billDueOn: "2026-10-05" });
    expect(opsOf("update")[0][0]).toMatchObject({ bill_id: "b1", bill_due_on: "2026-10-05" });
    expect(opsOf("eq")).toEqual(expect.arrayContaining([["status", "recorded"]]));
  });

  it("a due date already paid is refused in plain words", async () => {
    const { db } = fakeDb({
      expenses: [{ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "expenses_bill_due_recorded_uq"' } }],
    });
    await expect(linkExpenseToBill(db, "t1", "e1", "b1", "2026-10-05")).rejects.toThrow(BILL_COPY.dueAlreadyPaid);
  });

  it("unlinks both columns; a voided or invisible expense is refused", async () => {
    const { db, opsOf } = fakeDb({ expenses: [{ data: [], error: null }] });
    await expect(unlinkExpenseFromBill(db, "t1", "e1")).rejects.toThrow(BILL_COPY.expenseGone);
    expect(opsOf("update")[0][0]).toMatchObject({ bill_id: null, bill_due_on: null });
  });
});

describe("paying a bill", () => {
  const draft = {
    amountCents: 1_500_000,
    categoryId: "c-rent",
    spentOn: "2026-10-05",
    paidFrom: "bank" as const,
    outletId: null,
    clientRequestId: "r1",
  };

  it("records an ordinary expense carrying bill_id + bill_due_on", async () => {
    const { db, opsOf } = fakeDb({ expenses: [{ data: { id: "e1" }, error: null }] });
    await recordExpense(db, "t1", { ...draft, billId: "b1", billDueOn: "2026-10-05" }, "Ana");
    expect(opsOf("insert")[0][0]).toMatchObject({ bill_id: "b1", bill_due_on: "2026-10-05" });
  });

  it("an expense without a bill sends both as null", async () => {
    const { db, opsOf } = fakeDb({ expenses: [{ data: { id: "e1" }, error: null }] });
    await recordExpense(db, "t1", draft, "Ana");
    expect(opsOf("insert")[0][0]).toMatchObject({ bill_id: null, bill_due_on: null });
  });

  it("reads the link back (absent columns = no link)", () => {
    expect(toExpense(expenseRow({ bill_id: "b1", bill_due_on: "2026-10-05" }))).toMatchObject({ billId: "b1", billDueOn: "2026-10-05" });
    expect(toExpense(expenseRow())).toMatchObject({ billId: null, billDueOn: null });
  });
});

describe("describeBillError", () => {
  it("falls back to the expense wording", () => {
    expect(describeBillError({ code: "42501", message: "new row violates row-level security policy" })).toBe(EXPENSE_COPY.noAccess);
  });
});
