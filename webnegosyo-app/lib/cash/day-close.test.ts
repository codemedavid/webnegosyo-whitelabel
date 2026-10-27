import {
  DAY_CLOSE_COPY,
  closeBusinessDay,
  getDayCloseStatus,
  listDayCloses,
  parseDayCloseRecord,
  parseSnapshot,
  recordDayDeposit,
  reopenBusinessDay,
} from "./day-close";
import type { CashDb } from "./settings";
import { SNAPSHOT } from "./day-close.fixture";

interface Answer {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function fakeDb(rpcAnswers: Record<string, Answer> = {}, table: Answer = { data: [], error: null }) {
  const rpcCalls: [string, unknown][] = [];
  const ops: [string, unknown[]][] = [];
  const db: CashDb = {
    from(name: string) {
      ops.push(["from", [name]]);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) {
        builder[m] = (...args: unknown[]) => {
          ops.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: Answer) => unknown, reject: (r: unknown) => unknown) => Promise.resolve(table).then(resolve, reject);
      return builder;
    },
    rpc(fn, args) {
      rpcCalls.push([fn, args]);
      return Promise.resolve(rpcAnswers[fn] ?? { data: null, error: null });
    },
  };
  return { db, rpcCalls, ops };
}

const STATUS = {
  businessDay: "2026-10-24",
  window: { start: "2026-10-23T20:00:00.000Z", end: "2026-10-24T20:00:00.000Z" },
  cutoffMinutes: 240,
  openShifts: [{ shiftId: "s3", staffName: "Carlo", drawerName: "Bar", openedAt: "2026-10-24T10:00:00.000Z", overdue: true }],
  pendingRemittances: [{ id: "r2", cashierName: "Ben", handedOverCents: null, status: "pending" }],
  nonCashUnchecked: [],
  existingClose: null,
  preview: SNAPSHOT,
};

describe("parseSnapshot", () => {
  it("reads the frozen totals, shifts, named shifts and recounts", () => {
    const snap = parseSnapshot(SNAPSHOT)!;
    expect(snap.sales?.collectedByMethod).toEqual([
      { label: "Cash", cents: 2461500 },
      { label: "GCash", cents: 984000 },
    ]);
    expect(snap.shifts.map((s) => [s.staffName, s.closeKind, s.countedCents])).toEqual([
      ["Ana", "counted", 834500],
      ["Ben", "forced", null],
    ]);
    expect(snap.byServicePeriod).toHaveLength(2);
    // Pay-outs live on each shift in 20261027170000; unknown on a forced one.
    expect(snap.payOutCents).toBe(45000);
    expect(snap.otherHoursNetCents).toBe(122000);
    expect(snap.recountChanged).toEqual([{ shiftId: "s1", staffName: "Ana", firstCents: 0, finalCents: 834500 }]);
  });

  it("keeps sales absent (drawers only, or masked) rather than ₱0", () => {
    expect(parseSnapshot({ ...SNAPSHOT, sales: null })!.sales).toBeNull();
    expect(parseSnapshot({ ...SNAPSHOT, sales: { netCents: null } })!.sales).toBeNull();
  });
});

describe("getDayCloseStatus", () => {
  it("asks for one branch's day", async () => {
    const { db, rpcCalls } = fakeDb({ get_day_close_status: { data: STATUS, error: null } });
    const status = await getDayCloseStatus(db, "t1", "b1", "2026-10-24");
    expect(rpcCalls).toEqual([["get_day_close_status", { p_tenant: "t1", p_outlet: "b1", p_day: "2026-10-24" }]]);
    expect(status.openShifts).toHaveLength(1);
    expect(status.pendingRemittances[0].handedOverCents).toBeNull();
    expect(status.preview?.cashToAccountForCents).toBe(884500);
  });

  it("refuses a malformed day before reaching the server", async () => {
    const { db, rpcCalls } = fakeDb();
    await expect(getDayCloseStatus(db, "t1", null, "24-10-2026")).rejects.toThrow();
    expect(rpcCalls).toHaveLength(0);
  });

  it("says plainly when the server is not updated", async () => {
    const { db } = fakeDb({ get_day_close_status: { data: null, error: { code: "PGRST202", message: "missing" } } });
    await expect(getDayCloseStatus(db, "t1", null, "2026-10-24")).rejects.toThrow(DAY_CLOSE_COPY.notReady);
  });
});

describe("closeBusinessDay", () => {
  const input = { tenantId: "t1", outletId: null, dayKey: "2026-10-24", note: null, force: false };

  it("closes and returns the new version", async () => {
    const { db, rpcCalls } = fakeDb({ close_business_day: { data: { id: "c1", version: 2, snapshot: SNAPSHOT }, error: null } });
    await expect(closeBusinessDay(db, input)).resolves.toEqual({ id: "c1", version: 2 });
    expect(rpcCalls[0]).toEqual(["close_business_day", { p_tenant: "t1", p_outlet: null, p_day: "2026-10-24", p_note: null, p_force: false }]);
  });

  it.each([
    [{ code: "55000", message: "open_shifts" }, DAY_CLOSE_COPY.openShifts],
    [{ code: "55000", message: "unsettled_remittances" }, DAY_CLOSE_COPY.unsettled],
    [{ code: "23505", message: "duplicate" }, DAY_CLOSE_COPY.alreadyClosed],
    [{ code: "42501", message: "no" }, DAY_CLOSE_COPY.noAccess],
  ])("turns %p into words", async (error, words) => {
    const { db } = fakeDb({ close_business_day: { data: null, error } });
    await expect(closeBusinessDay(db, input)).rejects.toThrow(words);
  });

  it("an empty answer is a refusal", async () => {
    const { db } = fakeDb({ close_business_day: { data: null, error: null } });
    await expect(closeBusinessDay(db, input)).rejects.toThrow(DAY_CLOSE_COPY.refused);
  });

  it("forcing past unsettled remittances needs a note", async () => {
    const { db, rpcCalls } = fakeDb();
    await expect(closeBusinessDay(db, { ...input, force: true, note: "  " })).rejects.toThrow(DAY_CLOSE_COPY.noteRequired);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("reopen and deposit", () => {
  it("reopens with a reason; the owner-only refusal is worded", async () => {
    const { db, rpcCalls } = fakeDb();
    await reopenBusinessDay(db, "c1", "Forgot a GCash payment");
    expect(rpcCalls).toEqual([["reopen_business_day", { p_close_id: "c1", p_reason: "Forgot a GCash payment" }]]);
    await expect(reopenBusinessDay(db, "c1", " ")).rejects.toThrow(DAY_CLOSE_COPY.reasonRequired);
    const refused = fakeDb({ reopen_business_day: { data: null, error: { code: "42501", message: "owner" } } });
    await expect(reopenBusinessDay(refused.db, "c1", "x")).rejects.toThrow(DAY_CLOSE_COPY.reopenNoAccess);
  });

  it("records the deposit with its photo", async () => {
    const { db, rpcCalls } = fakeDb();
    await recordDayDeposit(db, "c1", { cents: 1985000, to: "BDO savings", ref: "DEP-1", proofUrl: "https://ik.imagekit.io/x/slip.jpg" });
    expect(rpcCalls).toEqual([
      ["record_day_deposit", { p_close_id: "c1", p_cents: 1985000, p_to: "BDO savings", p_ref: "DEP-1", p_proof_url: "https://ik.imagekit.io/x/slip.jpg" }],
    ]);
  });

  it("a second deposit on the same close is the server's refusal, in words", async () => {
    const { db } = fakeDb({ record_day_deposit: { data: null, error: { code: "P0002", message: "already" } } });
    await expect(recordDayDeposit(db, "c1", { cents: 1, to: "Safe", ref: null, proofUrl: null })).rejects.toThrow(DAY_CLOSE_COPY.changed);
  });
});

describe("history", () => {
  const ROW = {
    id: "c1",
    outlet_id: null,
    business_day: "2026-10-24",
    version: 1,
    status: "closed",
    sales_source: "platform_sql",
    snapshot: SNAPSHOT,
    note: null,
    closed_by_name: "Lorna",
    closed_at: "2026-10-24T20:30:00.000Z",
    unsettled_remittance_ids: ["r2"],
    forced_shift_ids: [],
    deposit_cents: 1985000,
    deposit_to: "BDO",
    deposit_ref: null,
    deposit_proof_url: null,
    deposit_recorded_at: "2026-10-25T01:00:00.000Z",
    reopened_by_name: null,
    reopened_at: null,
    reopen_reason: null,
  };

  it("reads the closes newest first, bounded", async () => {
    const { db, ops } = fakeDb({}, { data: [ROW], error: null });
    const list = await listDayCloses(db, "t1");
    expect(list[0]).toMatchObject({ id: "c1", unsettledRemittanceCount: 1, deposit: { cents: 1985000, to: "BDO" }, reopen: null });
    expect(ops).toContainEqual(["from", ["business_day_closes"]]);
    expect(ops).toContainEqual(["order", ["business_day", { ascending: false }]]);
  });

  it("an unrecorded deposit is null, not ₱0", () => {
    expect(parseDayCloseRecord({ ...ROW, deposit_cents: null, deposit_recorded_at: null }).deposit).toBeNull();
  });

  it("throws on a failed read", async () => {
    const { db } = fakeDb({}, { data: null, error: { code: "500", message: "boom" } });
    await expect(listDayCloses(db, "t1")).rejects.toThrow(/boom/);
  });
});
