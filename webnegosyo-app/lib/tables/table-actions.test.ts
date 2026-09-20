import {
  canClearTable,
  canSeat,
  formatSeatedFor,
  PARTY_SIZE_MAX,
  PARTY_SIZE_MIN,
  partySizeWarning,
  singleAppendableOrder,
  stepPartySize,
} from "./table-actions";
import type { TableOrderLike, TableView } from "./table-floor";

const MIN = 60_000;

function view(overrides: Partial<TableView> = {}): TableView {
  return {
    table: {
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
    },
    seating: { id: "s1", tableId: "t1", partySize: 2, seatedAt: 0, note: null },
    orders: [],
    status: "seated",
    runningBill: 0,
    unpaidTotal: 0,
    covers: 2,
    seatedForMs: 0,
    ...overrides,
  };
}

const order = (overrides: Partial<TableOrderLike> = {}): TableOrderLike => ({
  _id: "o1",
  _creationTime: 0,
  status: "confirmed",
  total: 100,
  paymentStatus: "unpaid",
  ...overrides,
});

describe("canClearTable", () => {
  it("refuses while the kitchen still has the table's order", () => {
    const verdict = canClearTable(view({ status: "ordered", orders: [order()] }));
    expect(verdict.allowed).toBe(false);
    expect(!verdict.allowed && verdict.reason).toMatch(/still/i);
  });

  it("refuses while a plate is waiting on the pass", () => {
    expect(canClearTable(view({ status: "ready", orders: [order({ status: "ready" })] })).allowed).toBe(false);
  });

  it("asks before clearing a table that still owes money", () => {
    const verdict = canClearTable(
      view({ status: "billing", orders: [order({ status: "delivered" })], unpaidTotal: 100 }),
    );
    expect(verdict).toEqual({ allowed: true, confirm: expect.stringMatching(/₱100/) });
  });

  it("clears a settled or empty table without ceremony", () => {
    expect(canClearTable(view())).toEqual({ allowed: true, confirm: null });
  });

  it("has nothing to clear on an empty table", () => {
    expect(canClearTable(view({ seating: null, status: "available", covers: 0 })).allowed).toBe(false);
  });
});

describe("canSeat", () => {
  it("only seats an empty table", () => {
    expect(canSeat(view({ seating: null }))).toBe(true);
    expect(canSeat(view())).toBe(false);
  });
});

describe("party size", () => {
  it("steps within bounds", () => {
    expect(stepPartySize(4, 1)).toBe(5);
    expect(stepPartySize(PARTY_SIZE_MIN, -1)).toBe(PARTY_SIZE_MIN);
    expect(stepPartySize(PARTY_SIZE_MAX, 1)).toBe(PARTY_SIZE_MAX);
  });

  it("warns, but never blocks, a party larger than the table", () => {
    expect(partySizeWarning(5, 4)).toMatch(/seats 4/);
    expect(partySizeWarning(4, 4)).toBeNull();
  });
});

describe("singleAppendableOrder", () => {
  it("offers the one order the kitchen is still working", () => {
    const cooking = order({ _id: "cooking", status: "preparing" });
    expect(singleAppendableOrder(view({ orders: [order({ _id: "served", status: "delivered" }), cooking] }))).toBe(
      cooking,
    );
  });

  it("offers nothing when there is none, or more than one, to add to", () => {
    expect(singleAppendableOrder(view({ orders: [] }))).toBeNull();
    expect(singleAppendableOrder(view({ orders: [order({ _id: "a" }), order({ _id: "b" })] }))).toBeNull();
  });
});

describe("formatSeatedFor", () => {
  it("reads in minutes under an hour, then hours and minutes, then days", () => {
    expect(formatSeatedFor(0)).toBe("0m");
    expect(formatSeatedFor(12 * MIN)).toBe("12m");
    expect(formatSeatedFor(65 * MIN)).toBe("1h 05m");
    expect(formatSeatedFor(26 * 60 * MIN)).toBe("1d 2h");
  });
});
