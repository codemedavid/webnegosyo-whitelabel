/** @jest-environment node */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

jest.mock("./_generated/server", () => ({
  mutation: (config: unknown) => config,
  query: (config: unknown) => config,
  internalMutation: (config: unknown) => config,
  internalQuery: (config: unknown) => config,
}));
jest.mock("./_generated/api", () => ({
  internal: { auth: { check: "auth:check", recordAccessAudit: "auth:recordAccessAudit" } },
}));

interface Row {
  _id: string;
  [field: string]: unknown;
}

/** Enough of `ctx.db` for the gate's config reads and the counter's rows. */
function fakeDb(config: Record<string, string>, audit: Row[] = []) {
  const db = {
    audit,
    query: (table: string) => {
      if (table === "tenantConfig") {
        return {
          withIndex: (_name: string, build: (q: { eq: (f: string, v: string) => unknown }) => unknown) => {
            let key = "";
            build({ eq: (_field, value) => { key = value; return null; } });
            return { first: async () => (key in config ? { value: config[key] } : null) };
          },
        };
      }
      return {
        withIndex: (_name: string, build: (q: unknown) => unknown) => {
          const filters: Array<(row: Row) => boolean> = [];
          const q = {
            eq: (field: string, value: unknown) => { filters.push((row) => row[field] === value); return q; },
            lt: (field: string, value: string) => { filters.push((row) => String(row[field]) < value); return q; },
            gte: (field: string, value: string) => { filters.push((row) => String(row[field]) >= value); return q; },
          };
          build(q);
          const matching = () => db.audit.filter((row) => filters.every((filter) => filter(row)));
          return {
            first: async () => matching()[0] ?? null,
            take: async (count: number) => matching().slice(0, count),
          };
        },
      };
    },
    insert: jest.fn(async (_table: string, row: Record<string, unknown>) => {
      db.audit = [...db.audit, { _id: `new-${db.audit.length}`, ...row }];
    }),
    patch: jest.fn(async (id: string, change: Record<string, unknown>) => {
      db.audit = db.audit.map((row) => (row._id === id ? { ...row, ...change } : row));
    }),
    delete: jest.fn(async (id: string) => {
      db.audit = db.audit.filter((row) => row._id !== id);
    }),
  };
  return db;
}

const SOFT = { tenant_id: "t1", auth_enforced: "false" };
const ENFORCED = { tenant_id: "t1", auth_enforced: "true" };
const MERCHANT = { subject: "u1", wn_role: "admin", wn_tenant_id: "t1" };

function mutationCtx(config: Record<string, string>, identity: unknown = null) {
  const runAfter = jest.fn(async () => "scheduled");
  return {
    runAfter,
    ctx: {
      auth: { getUserIdentity: async () => identity },
      db: fakeDb(config),
      scheduler: { runAfter },
    } as never,
  };
}

describe("requireAccess — counting writes", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireAccess } = require("./auth") as typeof import("./auth");

  test("an admitted token-less write is counted against its function", async () => {
    const { ctx, runAfter } = mutationCtx(SOFT);
    await requireAccess(ctx, "write", "orders:createOrder");
    expect(runAfter).toHaveBeenCalledWith(0, "auth:recordAccessAudit", {
      fn: "orders:createOrder",
      hasToken: false,
    });
  });

  test("a write that carried a token is counted as such", async () => {
    const { ctx, runAfter } = mutationCtx(SOFT, MERCHANT);
    await requireAccess(ctx, "write", "orders:recordPayment");
    expect(runAfter).toHaveBeenCalledWith(0, "auth:recordAccessAudit", {
      fn: "orders:recordPayment",
      hasToken: true,
    });
  });

  test("a refused write says why, in a form production does not redact", async () => {
    // A plain Error reaches a client on a production deployment as a bare
    // "Server Error", so nothing downstream could tell a missing token from a
    // bad sale. Only ConvexError data survives.
    const { ctx, runAfter } = mutationCtx(ENFORCED);
    const refusal = await requireAccess(ctx, "write", "orders:createOrder").catch((error) => error);
    expect(refusal.name).toBe("ConvexError");
    expect(refusal.data).toBe("Unauthorized: unauthenticated");
    expect(runAfter).not.toHaveBeenCalled();
  });

  test("a failure to count never blocks the write", async () => {
    const { ctx, runAfter } = mutationCtx(SOFT);
    runAfter.mockRejectedValueOnce(new Error("scheduler unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(requireAccess(ctx, "write", "orders:createOrder")).resolves.toBeUndefined();
    warn.mockRestore();
  });

  test("a read counts nothing", async () => {
    const { ctx, runAfter } = mutationCtx(SOFT);
    await requireAccess(ctx, "read");
    expect(runAfter).not.toHaveBeenCalled();
  });

  test("the query path stays read-only: an action's write check has no scheduler to reach", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { check } = require("./auth") as { check: { handler: (ctx: unknown, args: unknown) => Promise<boolean> } };
    const ctx = { auth: { getUserIdentity: async () => null }, db: fakeDb(SOFT) };
    await expect(check.handler(ctx, { kind: "write" })).resolves.toBe(true);
    await expect(check.handler({ ...ctx, db: fakeDb(ENFORCED) }, { kind: "write" })).rejects.toThrow();
  });
});

describe("recordAccessAudit", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { recordAccessAudit, getAccessAudit } = require("./auth") as unknown as {
    recordAccessAudit: { handler: (ctx: unknown, args: unknown) => Promise<void> };
    getAccessAudit: { handler: (ctx: unknown, args: unknown) => Promise<Array<Record<string, unknown>>> };
  };
  const NOW = Date.UTC(2026, 10, 6, 12);

  beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  test("the day's first write of a function opens its row", async () => {
    const db = fakeDb({});
    await recordAccessAudit.handler({ db }, { fn: "orders:createOrder", hasToken: false });
    expect(db.audit).toEqual([
      expect.objectContaining({ day: "2026-11-06", fn: "orders:createOrder", tokenless: 1, withToken: 0 }),
    ]);
  });

  test("later writes add to that row", async () => {
    const db = fakeDb({}, [{ _id: "a", day: "2026-11-06", fn: "orders:createOrder", tokenless: 1, withToken: 0 }]);
    await recordAccessAudit.handler({ db }, { fn: "orders:createOrder", hasToken: true });
    expect(db.audit[0]).toMatchObject({ tokenless: 1, withToken: 1 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("opening a new row prunes what has aged out, a bounded batch at a time", async () => {
    const aged = Array.from({ length: 80 }, (_, index) => ({
      _id: `old-${index}`, day: "2026-09-01", fn: `f${index}`, tokenless: 1, withToken: 0,
    }));
    const kept = { _id: "kept", day: "2026-10-20", fn: "orders:createOrder", tokenless: 1, withToken: 0 };
    const db = fakeDb({}, [...aged, kept]);
    await recordAccessAudit.handler({ db }, { fn: "orders:createOrder", hasToken: true });
    expect(db.delete).toHaveBeenCalledTimes(50);
    expect(db.audit.some((row) => row._id === "kept")).toBe(true);
  });

  test("adding to an open row prunes nothing", async () => {
    const db = fakeDb({}, [
      { _id: "old", day: "2026-09-01", fn: "x", tokenless: 1, withToken: 0 },
      { _id: "a", day: "2026-11-06", fn: "orders:createOrder", tokenless: 1, withToken: 0 },
    ]);
    await recordAccessAudit.handler({ db }, { fn: "orders:createOrder", hasToken: true });
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("the report answers counts only, for the days asked", async () => {
    const db = fakeDb({}, [
      { _id: "a", _creationTime: 1, day: "2026-11-06", fn: "orders:createOrder", tokenless: 2, withToken: 3 },
      { _id: "old", _creationTime: 1, day: "2026-10-01", fn: "orders:createOrder", tokenless: 9, withToken: 9 },
    ]);
    await expect(getAccessAudit.handler({ db }, { days: 7 })).resolves.toEqual([
      { day: "2026-11-06", fn: "orders:createOrder", tokenless: 2, withToken: 3 },
    ]);
  });
});

describe("template source", () => {
  test("every write gate names its function, so the audit row can say which", () => {
    // `requireAccess(ctx, "write")` would still compile under a looser config,
    // and the row it would have counted simply would not exist.
    const unnamed = readdirSync(__dirname)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "auth.ts")
      .filter((file) => /requireAccess\(ctx, "write"\)/.test(readFileSync(join(__dirname, file), "utf8")));
    expect(unnamed).toEqual([]);
  });
});
