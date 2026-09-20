import { describeTable, floorSubtitle, seatsLabel, TABLE_STATUS_LABELS, tableStatusLabel } from "./table-copy";
import type { TableView } from "./table-floor";

const MIN = 60_000;

function view(overrides: Partial<TableView> = {}): TableView {
  return {
    table: {
      id: "t1",
      tenantId: "tenant",
      outletId: null,
      label: "4",
      seats: 4,
      shape: "square",
      size: "md",
      zone: null,
      posX: 0,
      posY: 0,
      rotation: 0,
      sortOrder: 0,
      isActive: true,
    },
    seating: null,
    orders: [],
    status: "available",
    runningBill: 0,
    unpaidTotal: 0,
    covers: 0,
    seatedForMs: null,
    ...overrides,
  };
}

describe("table status copy", () => {
  it("names every status for the pills and legend", () => {
    expect(Object.keys(TABLE_STATUS_LABELS)).toEqual(["available", "seated", "ordered", "ready", "billing"]);
    expect(tableStatusLabel("ready")).toBe("Ready");
  });

  it("describes a table for a screen reader, in full", () => {
    expect(describeTable(view())).toBe("Table 4, available, seats 4");
    expect(
      describeTable(
        view({
          status: "ready",
          seating: { id: "s", tableId: "t1", partySize: 3, seatedAt: 0, note: null },
          covers: 3,
          seatedForMs: 42 * MIN,
          orders: [{ _id: "o", _creationTime: 0, status: "ready", total: 100 }],
        }),
      ),
    ).toBe("Table 4, ready, 3 guests, seated 42m, 1 order");
    expect(
      describeTable(
        view({
          status: "seated",
          seating: { id: "s", tableId: "t1", partySize: 1, seatedAt: 0, note: null },
          covers: 1,
          seatedForMs: 0,
        }),
      ),
    ).toBe("Table 4, seated, 1 guest, seated 0m");
  });

  it("sums the floor into one line for the header", () => {
    expect(floorSubtitle({ total: 0, byStatus: { available: 0, seated: 0, ordered: 0, ready: 0, billing: 0 }, covers: 0, seatsFree: 0 })).toBe(
      "No tables yet",
    );
    expect(floorSubtitle({ total: 6, byStatus: { available: 2, seated: 1, ordered: 2, ready: 1, billing: 0 }, covers: 11, seatsFree: 8 })).toBe(
      "4 seated · 11 guests · 2 free",
    );
  });
});

describe("seatsLabel", () => {
  it("counts seats in plain English", () => {
    expect(seatsLabel(4)).toBe("4 seats");
    expect(seatsLabel(1)).toBe("1 seat");
    expect(seatsLabel(0)).toBe("0 seats");
  });
});
