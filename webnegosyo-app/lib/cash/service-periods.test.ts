import {
  SERVICE_PERIOD_COPY,
  SERVICE_PERIOD_NAME_MAX,
  archiveServicePeriod,
  createServicePeriod,
  describePeriodTimes,
  formatClock,
  listServicePeriods,
  periodsForBranch,
  updateServicePeriod,
  validateServicePeriodInput,
  type ServicePeriod,
} from "./service-periods";
import type { CashDb } from "./settings";

interface Answer {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function fakeDb(answers: Answer[] = []) {
  const ops: [string, unknown[]][] = [];
  const db: CashDb = {
    from(table: string) {
      ops.push(["from", [table]]);
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "insert", "update", "eq", "is", "or", "order", "limit"]) {
        builder[name] = (...args: unknown[]) => {
          ops.push([name, args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(answers.shift() ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return { db, ops };
}

const OUTLET = "11111111-1111-4111-8111-111111111111";

const ROW = {
  id: "p1",
  tenant_id: "t1",
  outlet_id: null,
  name: "Night shift",
  starts_minutes: 1200,
  ends_minutes: 120,
  sort: 1,
  archived_at: null,
};

const DAY: ServicePeriod = {
  id: "p0",
  tenantId: "t1",
  outletId: null,
  name: "Day shift",
  startsMinutes: 720,
  endsMinutes: 1200,
  sort: 0,
};

describe("formatClock / describePeriodTimes", () => {
  it("says the times the way a person reads them", () => {
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(720)).toBe("12:00 PM");
    expect(formatClock(1215)).toBe("8:15 PM");
  });

  it("marks a shift that ends after midnight as the next day", () => {
    expect(describePeriodTimes(1200, 120)).toBe("8:00 PM – 2:00 AM (next day)");
    expect(describePeriodTimes(720, 1200)).toBe("12:00 PM – 8:00 PM");
  });
});

describe("validateServicePeriodInput", () => {
  it("trims the name and keeps the times", () => {
    expect(validateServicePeriodInput({ name: "  Night  ", startsMinutes: 1200, endsMinutes: 120, outletId: null }, [])).toEqual({
      ok: true,
      value: { name: "Night", startsMinutes: 1200, endsMinutes: 120, outletId: null },
    });
  });

  it.each([
    ["a blank name", { name: "  ", startsMinutes: 0, endsMinutes: 60 }, "name"],
    ["a name over the limit", { name: "x".repeat(SERVICE_PERIOD_NAME_MAX + 1), startsMinutes: 0, endsMinutes: 60 }, "name"],
    ["a start outside the day", { name: "A", startsMinutes: 1440, endsMinutes: 60 }, "times"],
    ["a fractional end", { name: "A", startsMinutes: 0, endsMinutes: 60.5 }, "times"],
    ["the same start and end", { name: "A", startsMinutes: 600, endsMinutes: 600 }, "times"],
  ])("refuses %s", (_label, input, field) => {
    const verdict = validateServicePeriodInput({ outletId: null, ...input }, []);
    expect(verdict).toMatchObject({ ok: false, field });
  });

  it("refuses a second shift with the same name in the same place, but allows it on another branch", () => {
    const input = { name: "day SHIFT", startsMinutes: 0, endsMinutes: 60, outletId: null };
    expect(validateServicePeriodInput(input, [DAY])).toMatchObject({ ok: false, field: "name" });
    expect(validateServicePeriodInput({ ...input, outletId: OUTLET }, [DAY]).ok).toBe(true);
    // Editing the shift itself is not a clash with itself.
    expect(validateServicePeriodInput(input, [DAY], DAY.id).ok).toBe(true);
  });
});

describe("periodsForBranch", () => {
  it("gives a branch its own shifts plus the every-branch ones", () => {
    const own = { ...DAY, id: "p2", outletId: OUTLET };
    const other = { ...DAY, id: "p3", outletId: "22222222-2222-4222-8222-222222222222" };
    expect(periodsForBranch([DAY, own, other], OUTLET).map((p) => p.id)).toEqual(["p0", "p2"]);
    expect(periodsForBranch([DAY, own, other], null).map((p) => p.id)).toEqual(["p0"]);
  });
});

describe("listServicePeriods", () => {
  it("reads the live shifts in order", async () => {
    const { db, ops } = fakeDb([{ data: [ROW], error: null }]);
    const list = await listServicePeriods(db, "t1");
    expect(list).toEqual([
      { id: "p1", tenantId: "t1", outletId: null, name: "Night shift", startsMinutes: 1200, endsMinutes: 120, sort: 1 },
    ]);
    expect(ops).toContainEqual(["from", ["service_periods"]]);
    expect(ops).toContainEqual(["is", ["archived_at", null]]);
  });

  it("narrows to a branch without interpolating anything that is not a uuid", async () => {
    const { db, ops } = fakeDb([{ data: [], error: null }]);
    await listServicePeriods(db, "t1", OUTLET);
    expect(ops).toContainEqual(["or", [`outlet_id.is.null,outlet_id.eq.${OUTLET}`]]);
    await expect(listServicePeriods(db, "t1", "x,outlet_id.neq.0")).rejects.toThrow();
  });

  it("is empty, not an error, for a store that never set any up", async () => {
    const { db } = fakeDb([{ data: [], error: null }]);
    await expect(listServicePeriods(db, "t1")).resolves.toEqual([]);
  });

  it("throws on a failed read so 'no shifts' is never a guess", async () => {
    const { db } = fakeDb([{ data: null, error: { code: "500", message: "boom" } }]);
    await expect(listServicePeriods(db, "t1")).rejects.toThrow(/boom/);
  });

  it("says the server needs an update when the table is missing", async () => {
    const { db } = fakeDb([{ data: null, error: { code: "42P01", message: "missing" } }]);
    await expect(listServicePeriods(db, "t1")).rejects.toThrow(/server update/);
  });
});

describe("writes", () => {
  const input = { name: "Night shift", startsMinutes: 1200, endsMinutes: 120, outletId: null };

  it("creates one after the others", async () => {
    const { db, ops } = fakeDb([{ data: [ROW], error: null }]);
    await expect(createServicePeriod(db, "t1", input, [DAY])).resolves.toMatchObject({ id: "p1" });
    const insert = ops.find(([name]) => name === "insert");
    expect(insert?.[1][0]).toEqual({
      tenant_id: "t1",
      outlet_id: null,
      name: "Night shift",
      starts_minutes: 1200,
      ends_minutes: 120,
      sort: 1,
    });
  });

  it.each([
    ["create", (db: CashDb) => createServicePeriod(db, "t1", input, [])],
    ["update", (db: CashDb) => updateServicePeriod(db, "t1", "p1", input, [])],
    ["archive", (db: CashDb) => archiveServicePeriod(db, "t1", "p1")],
  ])("%s: zero affected rows is a refusal, not a success", async (_label, run) => {
    const { db } = fakeDb([{ data: [], error: null }]);
    await expect(run(db)).rejects.toThrow(SERVICE_PERIOD_COPY.refused);
  });

  it("turns a permission refusal into words", async () => {
    const { db } = fakeDb([{ data: null, error: { code: "42501", message: "rls" } }]);
    await expect(updateServicePeriod(db, "t1", "p1", input, [])).rejects.toThrow(/Cash & day close/);
  });

  it("explains the database's one-name-per-place rule", async () => {
    const { db } = fakeDb([{ data: null, error: { code: "23505", message: "duplicate key" } }]);
    await expect(createServicePeriod(db, "t1", input, [])).rejects.toThrow("There is already a shift with that name.");
  });

  it("archives (never deletes) and scopes the write to the store", async () => {
    const { db, ops } = fakeDb([{ data: [{ id: "p1" }], error: null }]);
    await archiveServicePeriod(db, "t1", "p1");
    expect(ops.some(([name]) => name === "delete")).toBe(false);
    expect(ops).toContainEqual(["eq", ["tenant_id", "t1"]]);
    expect(ops).toContainEqual(["eq", ["id", "p1"]]);
    const update = ops.find(([name]) => name === "update");
    expect(Object.keys(update?.[1][0] as object)).toEqual(["archived_at"]);
  });

  it("refuses a bad input before reaching the server", async () => {
    const { db, ops } = fakeDb();
    await expect(createServicePeriod(db, "t1", { ...input, name: "" }, [])).rejects.toThrow();
    expect(ops).toHaveLength(0);
  });
});
