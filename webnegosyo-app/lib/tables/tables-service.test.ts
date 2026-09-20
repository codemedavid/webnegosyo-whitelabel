/**
 * The floor's Supabase reads and writes. A recording chain stands in for the
 * client: the tests pin the shape of each query — the table, the columns, and
 * above all the tenant filter on every read and write — and the row mappers.
 */

interface Call {
  table: string;
  ops: [string, unknown[]][];
}

let calls: Call[] = [];
let nextResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock("../supabase", () => {
  const METHODS = ["select", "eq", "is", "order", "insert", "update", "single", "maybeSingle"];
  return {
    supabase: {
      from: (table: string) => {
        const call: Call = { table, ops: [] };
        calls.push(call);
        const chain: Record<string, unknown> = {};
        for (const method of METHODS) {
          chain[method] = (...args: unknown[]) => {
            call.ops.push([method, args]);
            return chain;
          };
        }
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(nextResult).then(resolve);
        return chain;
      },
    },
  };
});

import {
  archiveDiningTable,
  clearSeating,
  createDiningTable,
  fetchDiningTables,
  fetchOpenSeatings,
  fetchOutletSlug,
  mapSeatingRow,
  mapTableRow,
  saveTablePositions,
  seatParty,
  updateDiningTable,
  updatePartySize,
} from "./tables-service";

const ROW = {
  id: "t1",
  tenant_id: "tenant",
  outlet_id: null,
  label: "12",
  seats: 4,
  shape: "round",
  size: "lg",
  zone: "Patio",
  pos_x: "0.2500",
  pos_y: 0.5,
  rotation: 90,
  sort_order: 2,
  is_active: true,
};

beforeEach(() => {
  calls = [];
  nextResult = { data: [], error: null };
});

const ops = (call: Call, method: string) => call.ops.filter(([name]) => name === method).map(([, args]) => args);

function expectTenantFilter(call: Call) {
  expect(ops(call, "eq")).toContainEqual(["tenant_id", "tenant"]);
}

describe("mapTableRow", () => {
  it("reads NUMERIC positions whether they arrive as text or number", () => {
    const table = mapTableRow(ROW);
    expect(table).toMatchObject({ id: "t1", label: "12", posX: 0.25, posY: 0.5, shape: "round", size: "lg", zone: "Patio", rotation: 90 });
  });

  it("falls back to a medium square for a shape or size it does not know", () => {
    expect(mapTableRow({ ...ROW, shape: "hexagon", size: "xl" })).toMatchObject({ shape: "square", size: "md" });
    // A floor written before tables could be turned reads as upright.
    expect(mapTableRow({ ...ROW, rotation: 45 }).rotation).toBe(0);
    expect(mapTableRow({ ...ROW, rotation: undefined }).rotation).toBe(0);
  });

  it("clamps a corrupt position onto the canvas", () => {
    expect(mapTableRow({ ...ROW, pos_x: "nope", pos_y: 7 })).toMatchObject({ posX: 0, posY: 1 });
  });
});

describe("mapSeatingRow", () => {
  it("parses the arrival into epoch ms", () => {
    const seating = mapSeatingRow({ id: "s1", table_id: "t1", party_size: 3, seated_at: "2026-09-19T12:00:00Z", note: null });
    expect(seating).toEqual({ id: "s1", tableId: "t1", partySize: 3, seatedAt: Date.UTC(2026, 8, 19, 12), note: null });
  });

  it("does not let an unparseable arrival poison the timer", () => {
    expect(mapSeatingRow({ id: "s1", table_id: "t1", party_size: 3, seated_at: "garbage", note: null }).seatedAt).toBe(0);
  });
});

describe("reads", () => {
  it("lists a tenant's live tables in floor order", async () => {
    nextResult = { data: [ROW], error: null };
    const tables = await fetchDiningTables("tenant");
    expect(tables).toHaveLength(1);
    const [call] = calls;
    expect(call.table).toBe("dining_tables");
    expectTenantFilter(call);
    expect(ops(call, "eq")).toContainEqual(["is_active", true]);
    expect(ops(call, "order").map(([column]) => column)).toEqual(["sort_order", "label"]);
  });

  it("lists only the parties still at a table", async () => {
    await fetchOpenSeatings("tenant");
    const [call] = calls;
    expect(call.table).toBe("table_seatings");
    expectTenantFilter(call);
    expect(ops(call, "is")).toContainEqual(["cleared_at", null]);
  });

  it("wraps a failed read in a message fit for the screen", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    await expect(fetchDiningTables("tenant")).rejects.toThrow("Could not load your tables: boom");
  });
});

describe("writes", () => {
  const value = { label: "12", seats: 4, shape: "square" as const, size: "md" as const, zone: null };

  it("creates a table on the tenant's floor and returns the row", async () => {
    nextResult = { data: ROW, error: null };
    const created = await createDiningTable({ tenantId: "tenant", outletId: "north", value, posX: 0.15, posY: 0.15, sortOrder: 3 });
    expect(created.id).toBe("t1");
    const [call] = calls;
    expect(ops(call, "insert")[0][0]).toEqual({
      tenant_id: "tenant",
      outlet_id: "north",
      label: "12",
      seats: 4,
      shape: "square",
      size: "md",
      zone: null,
      pos_x: 0.15,
      pos_y: 0.15,
      sort_order: 3,
    });
  });

  it("edits, archives and moves only within the tenant", async () => {
    await updateDiningTable("tenant", "t1", value);
    await archiveDiningTable("tenant", "t1");
    await saveTablePositions("tenant", [
      { id: "t1", posX: 0.1, posY: 0.2 },
      { id: "t2", posX: 0.3, posY: 0.4 },
    ]);
    expect(calls).toHaveLength(4);
    for (const call of calls) expectTenantFilter(call);
    expect(ops(calls[1], "update")[0][0]).toEqual({ is_active: false });
    expect(ops(calls[3], "update")[0][0]).toEqual({ pos_x: 0.3, pos_y: 0.4 });
  });

  it("saves nothing when no table moved", async () => {
    await saveTablePositions("tenant", []);
    expect(calls).toHaveLength(0);
  });

  it("writes the turn only when the move actually turned the table", async () => {
    // Arrange / Act
    await saveTablePositions("tenant", [
      { id: "t1", posX: 0.1, posY: 0.2 },
      { id: "t2", posX: 0.3, posY: 0.4, rotation: 90 },
    ]);

    // Assert: a plain drag leaves the stored rotation alone
    expect(ops(calls[0], "update")[0][0]).toEqual({ pos_x: 0.1, pos_y: 0.2 });
    expect(ops(calls[1], "update")[0][0]).toEqual({ pos_x: 0.3, pos_y: 0.4, rotation: 90 });
  });

  it("seats a party naming who seated them", async () => {
    nextResult = { data: { id: "s1", table_id: "t1", party_size: 3, seated_at: "2026-09-19T12:00:00Z", note: null }, error: null };
    const seating = await seatParty({ tenantId: "tenant", tableId: "t1", partySize: 3, userId: "u1" });
    expect(seating.partySize).toBe(3);
    expect(ops(calls[0], "insert")[0][0]).toEqual({
      tenant_id: "tenant",
      table_id: "t1",
      party_size: 3,
      note: null,
      seated_by: "u1",
    });
  });

  it("changes a party size and clears a table only while the seating is open", async () => {
    await updatePartySize("tenant", "s1", 5);
    await clearSeating("tenant", "s1", "u1");
    for (const call of calls) {
      expectTenantFilter(call);
      expect(ops(call, "is")).toContainEqual(["cleared_at", null]);
    }
    const cleared = ops(calls[1], "update")[0][0] as Record<string, unknown>;
    expect(cleared.cleared_by).toBe("u1");
    expect(typeof cleared.cleared_at).toBe("string");
  });

  it("surfaces a refused write", async () => {
    nextResult = { data: null, error: { message: "duplicate key" } };
    await expect(createDiningTable({ tenantId: "tenant", outletId: null, value, posX: 0, posY: 0, sortOrder: 0 })).rejects.toThrow(
      "Could not add the table: duplicate key",
    );
    await expect(seatParty({ tenantId: "tenant", tableId: "t1", partySize: 1, userId: null })).rejects.toThrow(
      "Could not seat the party",
    );
    await expect(saveTablePositions("tenant", [{ id: "t1", posX: 0, posY: 0 }])).rejects.toThrow(
      "Could not save the floor layout",
    );
  });
});
