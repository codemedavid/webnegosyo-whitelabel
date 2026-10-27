import {
  RECEIVERS_COPY,
  describePresence,
  listCashReceivers,
  parseReceivers,
  receiversForRemit,
  toRemitReceivers,
  type CashReceiver,
} from "./receivers";
import type { CashDb } from "./settings";

const NOW = Date.parse("2026-10-27T10:00:00.000Z");

function rpcDb(answer: { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls: [string, unknown][] = [];
  const db: CashDb = {
    from: () => {
      throw new Error("receivers are read through the RPC only");
    },
    rpc: (fn, args) => {
      calls.push([fn, args]);
      return Promise.resolve(answer);
    },
  };
  return { db, calls };
}

const maria: CashReceiver = { userId: "m", name: "Maria Santos", isOwner: false, outletId: "b1", isOnShift: true, lastSeenAt: null };
const lorna: CashReceiver = { userId: "o", name: "Lorna Cruz", isOwner: true, outletId: null, isOnShift: false, lastSeenAt: "2026-10-27T08:00:00.000Z" };
const ben: CashReceiver = { userId: "b", name: "Ben", isOwner: false, outletId: null, isOnShift: false, lastSeenAt: null };

describe("parseReceivers", () => {
  it("reads the RPC's camelCase rows and snake_case rows alike", () => {
    expect(
      parseReceivers([
        { userId: "m", name: "Maria Santos", isOwner: false, outletId: "b1", isOnShift: true, lastSeenAt: null },
        { user_id: "o", name: "Lorna Cruz", is_owner: true, outlet_id: null, is_on_shift: false, last_seen_at: "2026-10-27T08:00:00.000Z" },
      ]),
    ).toEqual([maria, lorna]);
  });

  it("names a nameless account instead of dropping it", () => {
    expect(parseReceivers([{ user_id: "x", name: null }])[0]).toMatchObject({ userId: "x", name: "Staff", isOnShift: false });
  });

  it("drops rows without a user and refuses a non-list", () => {
    expect(parseReceivers([{ name: "ghost" }])).toEqual([]);
    expect(() => parseReceivers({ nope: true })).toThrow();
  });
});

describe("receiversForRemit", () => {
  it("lists who is here first, then the owner, then by name — never the cashier handing over", () => {
    expect(receiversForRemit([ben, lorna, maria], "b").map((r) => r.userId)).toEqual(["m", "o"]);
  });

  it("keeps the owner when the owner is the one remitting (received by themselves)", () => {
    expect(receiversForRemit([lorna, maria], "o").map((r) => r.userId)).toEqual(["m", "o"]);
  });
});

describe("describePresence", () => {
  it("says who is on shift and when the others were last seen", () => {
    expect(describePresence(maria, NOW)).toBe("On shift now");
    expect(describePresence(lorna, NOW)).toBe("Last seen 2h ago");
    expect(describePresence({ ...lorna, lastSeenAt: "2026-10-27T09:40:00.000Z" }, NOW)).toBe("Last seen 20m ago");
    expect(describePresence(ben, NOW)).toBe("");
  });
});

describe("listCashReceivers", () => {
  it("asks the definer RPC for the branch's receivers (a cashier cannot read the roster)", async () => {
    const { db, calls } = rpcDb({ data: [{ userId: "m", name: "Maria" }], error: null });
    await expect(listCashReceivers(db, "t1", "b1")).resolves.toHaveLength(1);
    expect(calls).toEqual([["list_cash_receivers", { p_tenant: "t1", p_outlet: "b1" }]]);
  });

  it("says plainly when the server has not been updated", async () => {
    const { db } = rpcDb({ data: null, error: { code: "PGRST202", message: "not found" } });
    await expect(listCashReceivers(db, "t1", null)).rejects.toThrow(RECEIVERS_COPY.notReady);
  });

  it("throws on any other failure: an empty list would read as 'nobody can receive'", async () => {
    const { db } = rpcDb({ data: null, error: { code: "500", message: "boom" } });
    await expect(listCashReceivers(db, "t1", null)).rejects.toThrow(/boom/);
  });
});

describe("toRemitReceivers", () => {
  it("words each receiver for the Remit to picker, PIN status carried through", () => {
    expect(toRemitReceivers([lorna, { ...maria, hasPin: false }], "b", NOW)).toEqual([
      { userId: "m", name: "Maria Santos", roleLabel: "Manager", presence: "On shift now", hasPin: false },
      { userId: "o", name: "Lorna Cruz", roleLabel: "Owner", presence: "Last seen 2h ago" },
    ]);
  });

  it("reads has_pin when the server sends it", () => {
    expect(parseReceivers([{ user_id: "m", name: "Maria", has_pin: true }])[0].hasPin).toBe(true);
    expect("hasPin" in parseReceivers([{ user_id: "m", name: "Maria" }])[0]).toBe(false);
  });
});
