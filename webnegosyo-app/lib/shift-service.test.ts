/**
 * Opening, reading and closing a shift from the register.
 *
 * The phone IS the register, so the shift starts and ends where the money
 * does. Like a stock count session — and unlike an order — a shift moves no
 * money itself: it records the ACT of holding the drawer, so it writes
 * straight to Supabase and lets `staff_shifts` RLS confine the writer to the
 * branches they may reach (count-session-service.ts precedent).
 */

// The default client is never used — every test injects its own db — but the
// module still imports it, and the real one reaches expo-constants.
jest.mock("./supabase", () => ({ supabase: { from: jest.fn() } }));

import { loadOpenShift, openShift, closeShift, listShifts } from "./shift-service";

interface Recorded {
  filters: { table: string; column: string; value: unknown }[];
  isFilters: { table: string; column: string }[];
  gteFilters: { table: string; column: string; value: unknown }[];
  inserts: { table: string; row: Record<string, unknown> }[];
  updates: { table: string; row: Record<string, unknown> }[];
}

/**
 * A chainable Supabase stub, same shape as count-session-service.test.ts:
 * `results` keyed by table; an ARRAY is a queue answered call by call.
 */
function makeDb(results: Record<string, unknown>) {
  const recorded: Recorded = {
    filters: [],
    isFilters: [],
    gteFilters: [],
    inserts: [],
    updates: [],
  };
  const queues: Record<string, unknown[]> = {};
  for (const [table, value] of Object.entries(results)) {
    if (Array.isArray(value)) queues[table] = [...value];
  }

  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const settle = () => {
      const queue = queues[table];
      if (queue) return Promise.resolve(queue.shift() ?? { data: null, error: null });
      return Promise.resolve(results[table] ?? { data: null, error: null });
    };

    chain.select = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.eq = (column: string, value: unknown) => {
      recorded.filters.push({ table, column, value });
      return chain;
    };
    chain.is = (column: string) => {
      recorded.isFilters.push({ table, column });
      return chain;
    };
    chain.gte = (column: string, value: unknown) => {
      recorded.gteFilters.push({ table, column, value });
      return chain;
    };
    chain.insert = (row: Record<string, unknown>) => {
      recorded.inserts.push({ table, row });
      return chain;
    };
    chain.update = (row: Record<string, unknown>) => {
      recorded.updates.push({ table, row });
      return chain;
    };
    chain.single = settle;
    chain.maybeSingle = settle;
    chain.then = (resolve: (value: unknown) => unknown) => settle().then(resolve);

    return chain;
  };

  return { db: { from } as never, recorded };
}

const OPEN_SHIFT = {
  id: "s1",
  tenant_id: "t1",
  outlet_id: null,
  staff_user_id: "u1",
  staff_name: "Ana",
  status: "open",
  opening_float: 500,
  expected_cash: null,
  closing_count: null,
  opened_at: "2026-08-20T00:00:00Z",
  closed_at: null,
};

describe("loadOpenShift", () => {
  it("returns the shift this staff member is running", async () => {
    const { db, recorded } = makeDb({
      staff_shifts: { data: OPEN_SHIFT, error: null },
    });

    const shift = await loadOpenShift("t1", "u1", db);

    expect(shift?.id).toBe("s1");
    expect(shift?.openingFloat).toBe(500);
    // Scoped to the person, not just the store: two cashiers on one register
    // must each see their own drawer.
    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "staff_user_id",
      value: "u1",
    });
    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "tenant_id",
      value: "t1",
    });
    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "status",
      value: "open",
    });
  });

  it("returns null when they have not clocked in", async () => {
    const { db } = makeDb({ staff_shifts: { data: null, error: null } });
    expect(await loadOpenShift("t1", "u1", db)).toBeNull();
  });

  it("survives a dropped connection as null rather than a crash", async () => {
    // Same rationale as loadOpenCount: the worst a failed read can do is
    // offer "Start shift" to someone already on one, and pressing it JOINS
    // that shift rather than opening a second.
    const { db } = makeDb({
      staff_shifts: { data: null, error: { message: "network down" } },
    });
    expect(await loadOpenShift("t1", "u1", db)).toBeNull();
  });

  it("returns null without asking when the ids are missing", async () => {
    const { db, recorded } = makeDb({});
    expect(await loadOpenShift("", "u1", db)).toBeNull();
    expect(await loadOpenShift("t1", "", db)).toBeNull();
    expect(recorded.filters).toHaveLength(0);
  });
});

describe("openShift", () => {
  it("clocks in with the float that is in the drawer", async () => {
    const { db, recorded } = makeDb({
      staff_shifts: [
        { data: null, error: null }, // nobody clocked in
        { data: OPEN_SHIFT, error: null }, // the inserted row read back
      ],
    });

    const shift = await openShift(
      "t1",
      { outletId: null, staffUserId: "u1", staffName: "Ana", openingFloat: 500 },
      db,
    );

    expect(shift.id).toBe("s1");
    expect(recorded.inserts).toHaveLength(1);
    const row = recorded.inserts[0].row;
    expect(row.tenant_id).toBe("t1");
    expect(row.staff_user_id).toBe("u1");
    // The name is snapshotted onto the shift: deleting the staff account must
    // not anonymise last month's drawer history.
    expect(row.staff_name).toBe("Ana");
    expect(row.opening_float).toBe(500);
    expect(row.status).toBe("open");
  });

  it("joins the shift already running instead of opening a second", async () => {
    // Two open shifts for one person is two drawers for one pair of hands —
    // the unique index refuses it anyway; this makes the behaviour deliberate.
    const { db, recorded } = makeDb({
      staff_shifts: { data: OPEN_SHIFT, error: null },
    });

    const shift = await openShift(
      "t1",
      { outletId: null, staffUserId: "u1", staffName: "Ana", openingFloat: 999 },
      db,
    );

    expect(shift.id).toBe("s1");
    expect(shift.openingFloat).toBe(500);
    expect(recorded.inserts).toHaveLength(0);
  });

  it("refuses a negative float before touching the database", async () => {
    const { db, recorded } = makeDb({});
    await expect(
      openShift(
        "t1",
        { outletId: null, staffUserId: "u1", staffName: "Ana", openingFloat: -5 },
        db,
      ),
    ).rejects.toThrow();
    expect(recorded.inserts).toHaveLength(0);
  });

  it("throws a message the cashier can read when the write is refused", async () => {
    const { db } = makeDb({
      staff_shifts: [
        { data: null, error: null },
        { data: null, error: { message: "row-level security" } },
      ],
    });

    await expect(
      openShift(
        "t1",
        { outletId: "o9", staffUserId: "u1", staffName: "Ana", openingFloat: 0 },
        db,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("closeShift", () => {
  it("records what was counted and what was expected, and stamps the close", async () => {
    const { db, recorded } = makeDb({ staff_shifts: { data: { id: "s1" }, error: null } });

    await closeShift(
      "t1",
      "s1",
      { closingCount: 4750, expectedCash: 4750, note: null },
      db,
    );

    expect(recorded.updates).toHaveLength(1);
    const row = recorded.updates[0].row;
    expect(row.status).toBe("closed");
    expect(row.closing_count).toBe(4750);
    expect(row.expected_cash).toBe(4750);
    expect(typeof row.closed_at).toBe("string");
    // Scoped to tenant AND id AND still-open, not RLS alone — the same
    // belt-and-braces as closeCount.
    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "tenant_id",
      value: "t1",
    });
    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "id",
      value: "s1",
    });
    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "status",
      value: "open",
    });
  });

  it("refuses a negative counted amount before writing", async () => {
    const { db, recorded } = makeDb({});
    await expect(
      closeShift("t1", "s1", { closingCount: -1, expectedCash: 100, note: null }, db),
    ).rejects.toThrow();
    expect(recorded.updates).toHaveLength(0);
  });

  it("throws when the close is refused — a silent failure leaves the drawer open", async () => {
    const { db } = makeDb({
      staff_shifts: { data: null, error: { message: "permission denied" } },
    });
    await expect(
      closeShift("t1", "s1", { closingCount: 0, expectedCash: 0, note: null }, db),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("listShifts", () => {
  it("returns the store's shifts newest first for the owner's review", async () => {
    const closed = {
      ...OPEN_SHIFT,
      id: "s2",
      status: "closed",
      closed_at: "2026-08-20T12:00:00Z",
      closing_count: 4700,
      expected_cash: 4750,
    };
    const { db, recorded } = makeDb({
      staff_shifts: { data: [closed, OPEN_SHIFT], error: null },
    });

    const shifts = await listShifts("t1", { sinceIso: "2026-08-13T00:00:00Z" }, db);

    expect(shifts.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "tenant_id",
      value: "t1",
    });
    expect(recorded.gteFilters).toContainEqual({
      table: "staff_shifts",
      column: "opened_at",
      value: "2026-08-13T00:00:00Z",
    });
  });

  it("narrows to one staff member when asked", async () => {
    const { db, recorded } = makeDb({ staff_shifts: { data: [], error: null } });

    await listShifts("t1", { staffUserId: "u1" }, db);

    expect(recorded.filters).toContainEqual({
      table: "staff_shifts",
      column: "staff_user_id",
      value: "u1",
    });
  });

  it("throws when the read fails — an empty history would read as a clean one", async () => {
    const { db } = makeDb({
      staff_shifts: { data: null, error: { message: "timeout" } },
    });
    await expect(listShifts("t1", {}, db)).rejects.toThrow(/timeout/);
  });
});


it("refuses a close that did not update an open, authorized shift", async () => {
  const { db } = makeDb({ staff_shifts: { data: null, error: null } });
  await expect(closeShift("t1", "s1", { closingCount: 0, expectedCash: 0, note: null }, db)).rejects.toThrow("could not be closed");
});
