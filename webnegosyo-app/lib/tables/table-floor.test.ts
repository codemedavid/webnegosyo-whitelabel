import {
  buildTableViews,
  filterViews,
  ordersForTable,
  resolveTableStatus,
  SEATING_GRACE_MS,
  summarizeFloor,
  TABLE_ORDER_LOOKBACK_MS,
  type DiningTable,
  type TableOrderLike,
  type TableSeating,
} from "./table-floor";

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const MIN = 60_000;

function table(overrides: Partial<DiningTable> = {}): DiningTable {
  return {
    id: "t1",
    tenantId: "tenant",
    outletId: null,
    label: "12",
    seats: 4,
    shape: "square",
    size: "md",
    zone: null,
    posX: 0.2,
    posY: 0.2,
    rotation: 0,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

function seating(overrides: Partial<TableSeating> = {}): TableSeating {
  return { id: "s1", tableId: "t1", partySize: 3, seatedAt: NOW - 30 * MIN, note: null, ...overrides };
}

function order(overrides: Partial<TableOrderLike> = {}): TableOrderLike {
  return {
    _id: "o1",
    _creationTime: NOW - 10 * MIN,
    status: "confirmed",
    total: 450,
    paymentStatus: "unpaid",
    customerData: { table_number: "Table 12" },
    ...overrides,
  };
}

describe("ordersForTable", () => {
  it("matches on the normalized label, whatever the customer typed", () => {
    const orders = [
      order({ _id: "a", customerData: { table_number: "table 12" } }),
      order({ _id: "b", customerData: { table_number: "#12" } }),
      order({ _id: "c", customerData: { table_number: "13" } }),
      order({ _id: "d", customerData: {} }),
    ];
    const hits = ordersForTable("12", orders, { nowMs: NOW, seatedAt: null });
    expect(hits.map((o) => o._id)).toEqual(["a", "b"]);
  });

  it("ignores cancelled orders and orders older than the lookback", () => {
    const orders = [
      order({ _id: "cancelled", status: "cancelled" }),
      order({ _id: "stale", _creationTime: NOW - TABLE_ORDER_LOOKBACK_MS - MIN }),
      order({ _id: "live" }),
    ];
    expect(ordersForTable("12", orders, { nowMs: NOW, seatedAt: null }).map((o) => o._id)).toEqual(["live"]);
  });

  it("starts the window at the party's arrival, less a grace for orders rung just before", () => {
    const seatedAt = NOW - 20 * MIN;
    const orders = [
      order({ _id: "previous-party", _creationTime: seatedAt - SEATING_GRACE_MS - MIN }),
      order({ _id: "rung-just-before", _creationTime: seatedAt - SEATING_GRACE_MS + MIN }),
      order({ _id: "this-party", _creationTime: seatedAt + 5 * MIN }),
    ];
    expect(ordersForTable("12", orders, { nowMs: NOW, seatedAt }).map((o) => o._id)).toEqual([
      "this-party",
      "rung-just-before",
    ]);
  });

  it("keeps a branch's table from claiming another branch's order", () => {
    const orders = [
      order({ _id: "north", outlet_id: "north" }),
      order({ _id: "south", outlet_id: "south" }),
      order({ _id: "unbranched" }),
    ];
    const hits = ordersForTable("12", orders, { nowMs: NOW, seatedAt: null, outletId: "north" });
    expect(hits.map((o) => o._id)).toEqual(["north", "unbranched"]);
  });

  it("matches nothing for a table whose label is only a prefix", () => {
    expect(ordersForTable("Table", [order()], { nowMs: NOW, seatedAt: null })).toEqual([]);
  });

  it("lists the newest order first", () => {
    const orders = [
      order({ _id: "older", _creationTime: NOW - 40 * MIN }),
      order({ _id: "newer", _creationTime: NOW - 2 * MIN }),
    ];
    expect(ordersForTable("12", orders, { nowMs: NOW, seatedAt: null }).map((o) => o._id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("resolveTableStatus", () => {
  it("is available with no party and no orders", () => {
    expect(resolveTableStatus(null, [])).toBe("available");
  });

  it("is seated once a party sits down, before anything is ordered", () => {
    expect(resolveTableStatus(seating(), [])).toBe("seated");
  });

  it("is ordered while the kitchen has something for the table", () => {
    for (const status of ["pending", "confirmed", "preparing"]) {
      expect(resolveTableStatus(seating(), [order({ status })])).toBe("ordered");
    }
  });

  it("is ready when a plate is waiting on the pass, even with more cooking", () => {
    expect(resolveTableStatus(seating(), [order({ status: "preparing" }), order({ _id: "o2", status: "ready" })])).toBe(
      "ready",
    );
  });

  it("is billing once everything is served but money is still owed", () => {
    expect(resolveTableStatus(seating(), [order({ status: "delivered", paymentStatus: "unpaid" })])).toBe("billing");
  });

  it("falls back to seated when everything served is paid", () => {
    expect(resolveTableStatus(seating(), [order({ status: "delivered", paymentStatus: "paid" })])).toBe("seated");
  });

  it("shows orders on a table nobody seated — a walk-up that ordered from the QR", () => {
    expect(resolveTableStatus(null, [order({ status: "pending" })])).toBe("ordered");
    expect(resolveTableStatus(null, [order({ status: "delivered", paymentStatus: "paid" })])).toBe("available");
  });
});

describe("buildTableViews", () => {
  it("joins tables, their open seating and their orders", () => {
    const views = buildTableViews(
      [table(), table({ id: "t2", label: "13", seats: 2 })],
      [seating()],
      [order(), order({ _id: "o2", status: "ready", total: 120, customerData: { table_number: "13" } })],
      NOW,
    );

    expect(views).toHaveLength(2);
    const [twelve, thirteen] = views;
    expect(twelve.seating?.partySize).toBe(3);
    expect(twelve.status).toBe("ordered");
    expect(twelve.orders.map((o) => o._id)).toEqual(["o1"]);
    expect(twelve.runningBill).toBe(450);
    expect(twelve.unpaidTotal).toBe(450);
    expect(twelve.covers).toBe(3);
    expect(twelve.seatedForMs).toBe(30 * MIN);

    expect(thirteen.seating).toBeNull();
    expect(thirteen.status).toBe("ready");
    expect(thirteen.covers).toBe(0);
    expect(thirteen.seatedForMs).toBeNull();
  });

  it("counts only money still owed in the unpaid total", () => {
    const [view] = buildTableViews(
      [table()],
      [],
      [order({ total: 300, paymentStatus: "paid" }), order({ _id: "o2", total: 200, paymentStatus: "unpaid" })],
      NOW,
    );
    expect(view.runningBill).toBe(500);
    expect(view.unpaidTotal).toBe(200);
  });

  it("keeps archived tables off the floor and orders the rest by sort order then label", () => {
    const views = buildTableViews(
      [
        table({ id: "b", label: "B", sortOrder: 1 }),
        table({ id: "gone", label: "Z", isActive: false }),
        table({ id: "a", label: "A", sortOrder: 1 }),
        table({ id: "first", label: "9", sortOrder: 0 }),
      ],
      [],
      [],
      NOW,
    );
    expect(views.map((v) => v.table.id)).toEqual(["first", "a", "b"]);
  });

  it("ignores a seating whose table is not on the floor", () => {
    const views = buildTableViews([table()], [seating({ tableId: "elsewhere" })], [], NOW);
    expect(views[0].seating).toBeNull();
  });
});

describe("summarizeFloor and filterViews", () => {
  const views = buildTableViews(
    [table(), table({ id: "t2", label: "2", seats: 2 }), table({ id: "t3", label: "3", seats: 6 })],
    [seating(), seating({ id: "s2", tableId: "t3", partySize: 5 })],
    [order({ customerData: { table_number: "3" }, status: "ready" })],
    NOW,
  );

  it("counts tables by status, guests seated and seats still free", () => {
    const summary = summarizeFloor(views);
    expect(summary.total).toBe(3);
    expect(summary.byStatus).toEqual({ available: 1, seated: 1, ordered: 0, ready: 1, billing: 0 });
    expect(summary.covers).toBe(8);
    expect(summary.seatsFree).toBe(2);
  });

  it("filters to one status, or passes everything through", () => {
    expect(filterViews(views, "ready").map((v) => v.table.label)).toEqual(["3"]);
    expect(filterViews(views, "all")).toHaveLength(3);
  });
});
