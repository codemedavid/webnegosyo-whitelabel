import {
  EXPENSE_COPY,
  ExpenseWriteError,
  describeExpenseError,
  listCategories,
  listExpenses,
  listUnsortedPayouts,
  recordDrawerExpense,
  recordExpense,
  replaceExpense,
  storeTracksStock,
  toExpense,
  voidExpense,
  type ExpenseDb,
  type ExpenseRow,
} from "./expense-service";

interface Answer {
  data: unknown;
  error: { code?: string; message?: string; details?: string } | null;
}

interface Call {
  table: string;
  ops: [string, unknown[]][];
}

/**
 * A chainable stand-in for supabase-js: every builder method is recorded and
 * returns the builder; awaiting it takes the table's next scripted answer.
 */
function fakeDb(script: Record<string, Answer[]>, rpcAnswers: Record<string, Answer> = {}) {
  const calls: Call[] = [];
  const rpcCalls: [string, Record<string, unknown> | undefined][] = [];
  const db: ExpenseDb = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      const chain = (name: string) => (...args: unknown[]) => {
        call.ops.push([name, args]);
        return builder;
      };
      for (const name of ["select", "insert", "eq", "is", "in", "gte", "lte", "order", "range", "limit", "single"]) {
        builder[name] = chain(name);
      }
      builder.then = (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) => {
        const next = script[table]?.shift() ?? { data: [], error: null };
        return Promise.resolve(next).then(resolve, reject);
      };
      return builder;
    },
    rpc(fn, args) {
      rpcCalls.push([fn, args]);
      return Promise.resolve(rpcAnswers[fn] ?? { data: null, error: null });
    },
  };
  return { db, calls, rpcCalls };
}

const row: ExpenseRow = {
  id: "e1",
  tenant_id: "t1",
  outlet_id: null,
  category_id: "c-lpg",
  supplier_id: null,
  paid_to_name: null,
  staff_user_id: null,
  note: null,
  amount_cents: "125000",
  spent_on: "2026-10-21",
  paid_from: "drawer",
  shift_cash_movement_id: "m1",
  is_stock_purchase: null,
  doc_type: null,
  invoice_no: null,
  supplier_tin: null,
  vat_cents: null,
  ewt_cents: "0",
  ewt_rate: null,
  form_2307_given: null,
  status: "recorded",
  void_reason: null,
  voided_by: null,
  voided_at: null,
  replaces_expense_id: null,
  client_request_id: "req-1",
  created_by: "u1",
  created_by_name: "Ana",
  created_at: "2026-10-21T01:42:00Z",
  expense_receipts: [{ count: 2 }],
};

describe("describeExpenseError", () => {
  it("names the refusals a cashier can act on", () => {
    expect(describeExpenseError({ code: "22023", message: "note_required" })).toBe(EXPENSE_COPY.noteRequired);
    expect(describeExpenseError({ code: "22023", message: "drawer_locked" })).toBe(EXPENSE_COPY.drawerLocked);
    expect(describeExpenseError({ code: "P0001", message: "This shift is already closed" })).toBe(EXPENSE_COPY.shiftClosed);
    expect(describeExpenseError({ code: "P0002" })).toBe(EXPENSE_COPY.alreadyVoided);
    expect(describeExpenseError({ code: "23503" })).toBe(EXPENSE_COPY.missingReference);
    expect(describeExpenseError({ code: "23514", message: "expenses_amount_ck" })).toBe(EXPENSE_COPY.invalid);
  });

  it("names the Bills to pay refusals (20261022150000) instead of \"no access\"", () => {
    expect(describeExpenseError({ code: "42501", message: "That bill isn't one you can see" })).toBe(
      "That bill belongs to another branch, so it can't be marked here.",
    );
    expect(describeExpenseError({ code: "42501", message: "A branch bill is paid from its own branch" })).toBe("Pay this bill from its own branch.");
    expect(describeExpenseError({ code: "22023", message: "pause_until_past" })).toBe("Pick a day after today.");
  });

  it("says whose drawer it is when a drawer write is refused", () => {
    expect(describeExpenseError({ code: "42501" }, "drawer")).toBe(EXPENSE_COPY.drawerNotYours);
    expect(describeExpenseError({ code: "42501" }, "book")).toBe(EXPENSE_COPY.noAccess);
  });

  it("explains a store whose database has no expenses yet", () => {
    for (const code of ["PGRST202", "42883", "42P01", "PGRST205"]) {
      expect(describeExpenseError({ code })).toBe(EXPENSE_COPY.notSetUp);
    }
  });

  it("never shows a constraint or policy name", () => {
    expect(describeExpenseError({ code: "XX000", message: 'violates policy "expenses_insert"' })).toBe(EXPENSE_COPY.generic);
  });
});

describe("toExpense", () => {
  it("maps a row, reading numerics that arrive as strings", () => {
    const expense = toExpense(row);
    expect(expense.amountCents).toBe(125_000);
    expect(expense.ewtCents).toBe(0);
    expect(expense.vatCents).toBeNull();
    expect(expense.isStockPurchase).toBe(false);
    expect(expense.receiptCount).toBe(2);
    expect(expense.paidFrom).toBe("drawer");
    expect(expense.status).toBe("recorded");
  });
});

describe("recordExpense", () => {
  const draft = {
    amountCents: 8_000,
    categoryId: "c-transport",
    spentOn: "2026-10-21",
    paidFrom: "cash" as const,
    outletId: null,
    note: "  Pamasahe to palengke ",
    paidToName: "   ",
    clientRequestId: "req-9",
  };

  it("inserts with the request id and trimmed text, and returns the new id", async () => {
    const { db, calls } = fakeDb({ expenses: [{ data: { id: "e9" }, error: null }] });

    const id = await recordExpense(db, "t1", draft, "Owner");

    expect(id).toBe("e9");
    const [, [insert]] = calls[0].ops[0] as [string, [Record<string, unknown>]];
    expect(insert).toMatchObject({
      tenant_id: "t1",
      client_request_id: "req-9",
      note: "Pamasahe to palengke",
      paid_to_name: null,
      amount_cents: 8_000,
      created_by_name: "Owner",
    });
  });

  it("treats a replay of a request that already landed as success", async () => {
    const { db } = fakeDb({
      expenses: [
        { data: null, error: { code: "23505", message: 'duplicate key value violates "expenses_client_request_id_key"' } },
        { data: [{ id: "e-first" }], error: null },
      ],
    });

    await expect(recordExpense(db, "t1", draft, "Owner")).resolves.toBe("e-first");
  });

  it("fails loudly when RLS answers with nothing", async () => {
    const { db } = fakeDb({ expenses: [{ data: null, error: null }] });
    await expect(recordExpense(db, "t1", draft, "Owner")).rejects.toThrow(EXPENSE_COPY.noAccess);
  });

  it("marks a dropped connection as a network failure so the caller queues it", async () => {
    const db: ExpenseDb = {
      from: () => ({
        insert: () => ({ select: () => ({ single: () => Promise.reject(new TypeError("Network request failed")) }) }),
      }),
      rpc: jest.fn(),
    };
    const error = await recordExpense(db, "t1", draft, "Owner").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExpenseWriteError);
    expect((error as ExpenseWriteError).isNetwork).toBe(true);
  });
});

describe("recordDrawerExpense", () => {
  const input = {
    shiftId: "s1",
    amountCents: 125_000,
    categoryId: "c-lpg",
    note: "",
    clientRequestId: "req-1",
    recordedByName: "Ana",
  };

  it("calls the RPC with every argument the contract names", async () => {
    const { db, rpcCalls } = fakeDb({}, { record_drawer_expense: { data: "e1", error: null } });

    await expect(recordDrawerExpense(db, input)).resolves.toBe("e1");
    expect(rpcCalls[0]).toEqual([
      "record_drawer_expense",
      {
        p_shift_id: "s1",
        p_amount_cents: 125_000,
        p_category_id: "c-lpg",
        p_note: null,
        p_supplier_id: null,
        p_paid_to_name: null,
        p_recorded_by_name: "Ana",
        p_client_request_id: "req-1",
      },
    ]);
  });

  it("sends the stock answer only when it is yes (older databases take eight arguments)", async () => {
    const { db, rpcCalls } = fakeDb({}, { record_drawer_expense: { data: "e2", error: null } });
    await recordDrawerExpense(db, { ...input, isStockPurchase: true });
    await recordDrawerExpense(db, { ...input, isStockPurchase: false });
    expect(rpcCalls[0][1]).toMatchObject({ p_is_stock_purchase: true });
    expect(rpcCalls[1][1]).not.toHaveProperty("p_is_stock_purchase");
  });

  it("turns a closed shift into words", async () => {
    const { db } = fakeDb(
      {},
      { record_drawer_expense: { data: null, error: { code: "P0001", message: "This shift is already closed" } } },
    );
    await expect(recordDrawerExpense(db, input)).rejects.toThrow(EXPENSE_COPY.shiftClosed);
  });

  it("refuses an empty answer instead of trusting 'no error'", async () => {
    const { db } = fakeDb({}, { record_drawer_expense: { data: null, error: null } });
    await expect(recordDrawerExpense(db, input)).rejects.toThrow(EXPENSE_COPY.drawerNotYours);
  });
});

describe("voidExpense / replaceExpense", () => {
  it("names who put the cash back when a drawer expense is voided", async () => {
    const { db, rpcCalls } = fakeDb({}, { void_expense: { data: null, error: null } });
    await voidExpense(db, "e1", "Undo", "Ana");
    expect(rpcCalls[0]).toEqual(["void_expense", { p_expense_id: "e1", p_reason: "Undo", p_actor_name: "Ana" }]);
  });

  it("explains why a closed shift's drawer expense can't be voided", async () => {
    const { db } = fakeDb({}, { void_expense: { data: null, error: { code: "22023", message: "drawer_shift_closed" } } });
    await expect(voidExpense(db, "e1", "wrong")).rejects.toThrow(EXPENSE_COPY.drawerShiftClosed);
  });

  it("needs a reason before anything is sent", async () => {
    const { db, rpcCalls } = fakeDb({});
    await expect(voidExpense(db, "e1", "   ")).rejects.toThrow(/reason/i);
    expect(rpcCalls).toEqual([]);
  });

  it("refuses to change a drawer row's money or date on the phone", async () => {
    const { db, rpcCalls } = fakeDb({});
    await expect(
      replaceExpense(db, { id: "e1", paidFrom: "drawer" }, "wrong amount", { amount_cents: 100 }),
    ).rejects.toThrow(EXPENSE_COPY.drawerLocked);
    expect(rpcCalls).toEqual([]);
  });

  it("re-sorts a drawer row's category", async () => {
    const { db, rpcCalls } = fakeDb({}, { replace_expense: { data: "e2", error: null } });
    await expect(
      replaceExpense(db, { id: "e1", paidFrom: "drawer" }, "wrong category", { category_id: "c-ice" }),
    ).resolves.toBe("e2");
    expect(rpcCalls[0][1]).toEqual({ p_expense_id: "e1", p_reason: "wrong category", p_patch: { category_id: "c-ice" } });
  });
});

describe("listCategories", () => {
  it("seeds a store with no categories, then reads them", async () => {
    const seeded = [{ id: "c1", tenant_id: "t1", system_key: "ice", name: "Ice (Yelo)", icon: "IC", grp: "ingredients", needs_note: false, sort_order: 10, archived_at: null }];
    const { db, rpcCalls } = fakeDb({ expense_categories: [{ data: [], error: null }, { data: seeded, error: null }] });

    const categories = await listCategories(db, "t1");

    expect(rpcCalls).toEqual([["ensure_expense_categories", { p_tenant_id: "t1" }]]);
    expect(categories.map((c) => [c.name, c.group, c.needsNote])).toEqual([["Ice (Yelo)", "ingredients", false]]);
  });
});

describe("storeTracksStock", () => {
  it("tracks stock once the store has a recipe", async () => {
    const { db } = fakeDb({ recipes: [{ data: [{ id: "r1" }], error: null }] });
    await expect(storeTracksStock(db, "t1")).resolves.toBe(true);
  });

  it("does not without one", async () => {
    const { db } = fakeDb({ recipes: [{ data: [], error: null }] });
    await expect(storeTracksStock(db, "t1")).resolves.toBe(false);
  });

  it("throws on a failed read instead of caching 'does not track stock'", async () => {
    const { db } = fakeDb({ recipes: [{ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }] });
    await expect(storeTracksStock(db, "t1")).rejects.toThrow();
  });
});

describe("listExpenses", () => {
  it("pages past the 1000-row cap", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ ...row, id: `e${i}` }));
    const { db, calls } = fakeDb({ expenses: [{ data: page(1000), error: null }, { data: page(3), error: null }] });

    const month = await listExpenses(db, { tenantId: "t1", month: "2026-10" });

    expect(month.expenses).toHaveLength(1003);
    expect(month.isTruncated).toBe(false);
    const ranges = calls.map((call) => call.ops.find(([name]) => name === "range")?.[1]);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["gte", ["spent_on", "2026-10-01"]],
        ["lte", ["spent_on", "2026-10-31"]],
      ]),
    );
  });
});

describe("listUnsortedPayouts", () => {
  it("lists only pay-outs that no expense (of any status) sorted yet", async () => {
    const movements = [
      { id: "m1", shift_id: "s1", outlet_id: null, amount: "120.00", reason: "ice", recorded_by_name: "Ana", created_at: "2026-10-20T00:00:00Z" },
      { id: "m2", shift_id: "s1", outlet_id: null, amount: "80.50", reason: "pamasahe", recorded_by_name: null, created_at: "2026-10-19T00:00:00Z" },
    ];
    const { db } = fakeDb({
      shift_cash_movements: [{ data: movements, error: null }],
      expenses: [{ data: [{ id: "e1", shift_cash_movement_id: "m1", category_id: "c", status: "void", expense_categories: { name: "Ice", grp: "ingredients" } }], error: null }],
    });

    const unsorted = await listUnsortedPayouts(db, "t1", Date.parse("2026-10-21T00:00:00Z"));

    expect(unsorted).toEqual([
      expect.objectContaining({ movementId: "m2", amountCents: 8_050, reason: "pamasahe", recordedByName: "Staff" }),
    ]);
  });
});
