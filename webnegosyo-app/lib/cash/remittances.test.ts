import {
  REMITTANCE_COPY,
  acceptRemittance,
  actionsFor,
  cashierWaiting,
  disputeRemittance,
  forceCloseShift,
  inboxTabs,
  listRemittances,
  parseRemittance,
  receivedDifference,
  receiverSummary,
  resolveRemittance,
  shiftResult,
  validateAccept,
  validateDispute,
  validateResolve,
  type Remittance,
} from "./remittances";
import type { CashDb } from "./settings";

interface Answer {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function fakeDb(tableAnswer: Answer = { data: [], error: null }, rpcAnswers: Record<string, Answer> = {}) {
  const ops: [string, unknown[]][] = [];
  const rpcCalls: [string, unknown][] = [];
  const db: CashDb = {
    from(table: string) {
      ops.push(["from", [table]]);
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "eq", "is", "in", "or", "order", "limit"]) {
        builder[name] = (...args: unknown[]) => {
          ops.push([name, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: Answer) => unknown, reject: (r: unknown) => unknown) =>
        Promise.resolve(tableAnswer).then(resolve, reject);
      return builder;
    },
    rpc(fn, args) {
      rpcCalls.push([fn, args]);
      return Promise.resolve(rpcAnswers[fn] ?? { data: null, error: null });
    },
  };
  return { db, ops, rpcCalls };
}

const ROW = {
  id: "r1",
  tenant_id: "t1",
  outlet_id: "b1",
  kind: "shift",
  shift_id: "s1",
  movement_id: null,
  business_day: "2026-10-24",
  cashier_user_id: "ana",
  cashier_name: "Ana Reyes",
  handed_over_cents: 634500,
  remitted_to: "maria",
  remitted_to_name: "Maria Santos",
  to_safe: false,
  status: "pending",
  received_cents: null,
  received_by: null,
  received_by_name: null,
  received_at: null,
  accept_method: null,
  is_self_received: false,
  receiver_note: null,
  dispute_reason: null,
  resolved_by_name: null,
  resolved_at: null,
  resolution_note: null,
  created_at: "2026-10-24T18:51:00.000Z",
  shift: { drawer_name: "Cashier 1", opened_at: "2026-10-24T10:02:00.000Z", closed_at: "2026-10-24T18:48:00.000Z", closing_count: "8345.00", expected_cash: 8465, variance_reason: "wrong_change" },
};

const base = parseRemittance(ROW);
const make = (patch: Partial<Remittance>): Remittance => ({ ...base, ...patch });

describe("parseRemittance", () => {
  it("reads a row with its shift (pesos on the shift become centavos)", () => {
    expect(base).toMatchObject({
      id: "r1",
      kind: "shift",
      status: "pending",
      handedOverCents: 634500,
      cashierName: "Ana Reyes",
      remittedToName: "Maria Santos",
      shift: { drawerName: "Cashier 1", countedCents: 834500, expectedCents: 846500, varianceReason: "wrong_change" },
    });
  });

  it("reads an RPC answer in camelCase the same way", () => {
    const camel = parseRemittance({ id: "r2", tenantId: "t1", kind: "pickup", status: "accepted", handedOverCents: 250000, receivedCents: 250000, cashierName: "Ana" });
    expect(camel).toMatchObject({ id: "r2", kind: "pickup", status: "accepted", receivedCents: 250000, shift: null });
  });

  it("keeps an unknown handed-over amount unknown (a forced close), never 0", () => {
    expect(parseRemittance({ ...ROW, handed_over_cents: null }).handedOverCents).toBeNull();
  });

  it("refuses an unknown status or kind", () => {
    expect(() => parseRemittance({ ...ROW, status: "lost" })).toThrow();
    expect(() => parseRemittance({ ...ROW, kind: "tip" })).toThrow();
  });
});

describe("shiftResult / receivedDifference", () => {
  it("says the cashier's count against expected", () => {
    expect(shiftResult(base)).toEqual({ verdict: "short", cents: 12000 });
    expect(shiftResult(make({ shift: { ...base.shift!, countedCents: 846500 } }))).toEqual({ verdict: "exact", cents: 0 });
    expect(shiftResult(make({ shift: null }))).toEqual({ verdict: "unknown", cents: null });
  });

  it("says what the receiver got against the slip", () => {
    expect(receivedDifference(make({ status: "accepted", receivedCents: 630000 }))).toBe(-4500);
    expect(receivedDifference(base)).toBeNull();
    expect(receivedDifference(make({ handedOverCents: null, receivedCents: 100 }))).toBeNull();
  });
});

describe("validation", () => {
  it("accepts the slip amount without a note", () => {
    expect(validateAccept(634500, 634500, "")).toEqual({ ok: true, value: { receivedCents: 634500, note: null } });
  });

  it("needs a note when a different amount was received", () => {
    expect(validateAccept(634500, 630000, " ")).toEqual({ ok: false, reason: REMITTANCE_COPY.noteRequired });
    expect(validateAccept(634500, 630000, "₱45 short in the envelope")).toMatchObject({ ok: true });
  });

  it("needs a counted amount on a forced close (no slip to compare with)", () => {
    expect(validateAccept(null, 500000, "")).toEqual({ ok: true, value: { receivedCents: 500000, note: null } });
  });

  it("refuses an impossible amount", () => {
    expect(validateAccept(100, -1, "x").ok).toBe(false);
    expect(validateAccept(100, 1.5, "x").ok).toBe(false);
  });

  it("needs a reason to report a problem and a note to resolve one", () => {
    expect(validateDispute("", null).ok).toBe(false);
    expect(validateDispute("Envelope missing", null)).toEqual({ ok: true, value: { reason: "Envelope missing", receivedCents: null } });
    expect(validateResolve("  ").ok).toBe(false);
    expect(validateResolve("Found it in the safe")).toEqual({ ok: true, value: "Found it in the safe" });
  });
});

describe("actionsFor", () => {
  const maria = { userId: "maria", isOwner: false, canManageCash: true };

  it("lets a cash manager accept or report a pending remittance", () => {
    expect(actionsFor(base, maria)).toEqual({ canAccept: true, canDispute: true, canResolve: false });
  });

  it("never lets the cashier accept their own cash, unless they are the owner", () => {
    expect(actionsFor(base, { userId: "ana", isOwner: false, canManageCash: true }).canAccept).toBe(false);
    expect(actionsFor(base, { userId: "ana", isOwner: true, canManageCash: true }).canAccept).toBe(true);
  });

  it("offers resolve only on a disputed one, and nothing to a cashier", () => {
    expect(actionsFor(make({ status: "disputed" }), maria)).toEqual({ canAccept: false, canDispute: false, canResolve: true });
    expect(actionsFor(base, { userId: "x", isOwner: false, canManageCash: false })).toEqual({
      canAccept: false,
      canDispute: false,
      canResolve: false,
    });
  });
});

describe("inbox", () => {
  const list = [
    base,
    make({ id: "r2", status: "disputed" }),
    make({ id: "r3", status: "accepted", receivedCents: 634500 }),
    make({ id: "r4", status: "resolved" }),
    make({ id: "p1", kind: "pickup", handedOverCents: 250000 }),
  ];

  it("splits To accept · Accepted · Pickups", () => {
    const tabs = inboxTabs(list);
    expect(tabs.toAccept.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(tabs.accepted.map((r) => r.id)).toEqual(["r3", "r4"]);
    expect(tabs.pickups.map((r) => r.id)).toEqual(["p1"]);
  });

  it("sums what waits for the receiver's Home strip, pickups included", () => {
    expect(receiverSummary(list)).toEqual({ count: 2, totalCents: 884500, line: "2 remits to accept · ₱8,845" });
    expect(receiverSummary([])).toBeNull();
  });

  it("tells the cashier their latest remittance is waiting", () => {
    expect(cashierWaiting(list, "ana")).toBe("Remitted ₱6,345 · waiting for Maria");
    expect(cashierWaiting([make({ remittedTo: null, remittedToName: null, toSafe: true })], "ana")).toBe(
      "Remitted ₱6,345 · in the safe, waiting to be counted",
    );
    expect(cashierWaiting(list, "ben")).toBeNull();
  });
});

describe("reads", () => {
  it("reads the store's open and recent remittances with their shift, bounded", async () => {
    const { db, ops } = fakeDb({ data: [ROW], error: null });
    const list = await listRemittances(db, "t1", { sinceIso: "2026-10-13T00:00:00.000Z" });
    expect(list).toHaveLength(1);
    expect(ops).toContainEqual(["from", ["cash_remittances"]]);
    expect(ops).toContainEqual(["eq", ["tenant_id", "t1"]]);
    expect(ops).toContainEqual(["or", ["status.in.(pending,disputed),created_at.gte.2026-10-13T00:00:00.000Z"]]);
    expect(ops.find(([name]) => name === "limit")?.[1][0]).toBeLessThanOrEqual(500);
  });

  it("narrows to a cashier's own", async () => {
    const { db, ops } = fakeDb({ data: [], error: null });
    await listRemittances(db, "t1", { sinceIso: "2026-10-13T00:00:00.000Z", cashierUserId: "ana" });
    expect(ops).toContainEqual(["eq", ["cashier_user_id", "ana"]]);
  });

  it("throws on a failed read so an empty inbox is never a guess", async () => {
    const { db } = fakeDb({ data: null, error: { code: "500", message: "boom" } });
    await expect(listRemittances(db, "t1", { sinceIso: "2026-10-13T00:00:00.000Z" })).rejects.toThrow(/boom/);
  });

  it("refuses an injected since value", async () => {
    const { db } = fakeDb();
    await expect(listRemittances(db, "t1", { sinceIso: "x),status.eq.accepted" })).rejects.toThrow();
  });
});

describe("transitions", () => {
  it("accepts with the amount and note, returning the saved row", async () => {
    const { db, rpcCalls } = fakeDb(undefined, {
      accept_remittance: { data: { ...ROW, status: "accepted", received_cents: 634500, received_at: "x" }, error: null },
    });
    await expect(acceptRemittance(db, base, 634500, "")).resolves.toMatchObject({ status: "accepted" });
    expect(rpcCalls).toEqual([["accept_remittance", { p_id: "r1", p_received_cents: 634500, p_note: null }]]);
  });

  it("an empty answer is a refusal, not a success", async () => {
    const { db } = fakeDb(undefined, { accept_remittance: { data: null, error: null } });
    await expect(acceptRemittance(db, base, 634500, "")).rejects.toThrow(REMITTANCE_COPY.refused);
  });

  it("says someone else already handled it when the CAS loses", async () => {
    const { db } = fakeDb(undefined, {
      accept_remittance: { data: null, error: { code: "P0002", message: "remittance_not_pending" } },
    });
    await expect(acceptRemittance(db, base, 634500, "")).rejects.toThrow(REMITTANCE_COPY.notPending);
  });

  it("explains a permission refusal", async () => {
    const { db } = fakeDb(undefined, { accept_remittance: { data: null, error: { code: "42501", message: "no" } } });
    await expect(acceptRemittance(db, base, 634500, "")).rejects.toThrow(REMITTANCE_COPY.noAccess);
  });

  it("refuses a different amount without a note before reaching the server", async () => {
    const { db, rpcCalls } = fakeDb();
    await expect(acceptRemittance(db, base, 600000, "")).rejects.toThrow(REMITTANCE_COPY.noteRequired);
    expect(rpcCalls).toHaveLength(0);
  });

  it("disputes and resolves", async () => {
    const { db, rpcCalls } = fakeDb(undefined, {
      dispute_remittance: { data: { ...ROW, status: "disputed", dispute_reason: "Missing", received_at: "x" }, error: null },
      resolve_remittance: { data: { ...ROW, status: "resolved", resolved_at: "y" }, error: null },
    });
    await disputeRemittance(db, base, "Missing", null);
    await resolveRemittance(db, make({ status: "disputed" }), "Found it");
    expect(rpcCalls).toEqual([
      ["dispute_remittance", { p_id: "r1", p_reason: "Missing", p_received_cents: null }],
      ["resolve_remittance", { p_id: "r1", p_note: "Found it" }],
    ]);
  });

  it("force-closes a shift with the manager's note", async () => {
    const { db, rpcCalls } = fakeDb(undefined, {
      force_close_shift: { data: { closedAt: "2026-10-25T03:00:00.000Z", remittanceId: "r9" }, error: null },
    });
    await expect(forceCloseShift(db, "s1", "Went home sick")).resolves.toEqual({
      closedAt: "2026-10-25T03:00:00.000Z",
      remittanceId: "r9",
    });
    expect(rpcCalls).toEqual([["force_close_shift", { p_shift_id: "s1", p_note: "Went home sick" }]]);
  });

  it("a force close that answers nothing did not happen", async () => {
    const { db } = fakeDb(undefined, { force_close_shift: { data: null, error: null } });
    await expect(forceCloseShift(db, "s1", "")).rejects.toThrow(REMITTANCE_COPY.forceCloseRefused);
  });
});
