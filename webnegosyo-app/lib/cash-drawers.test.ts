import {
  canManageCash,
  defaultDrawerChoice,
  describeDrawerPolicy,
  drawerBoard,
  suggestDrawerName,
  summarizeCashMoves,
  validateCashMove,
  validateDrawerInput,
  type CashDrawer,
} from "./cash-drawers";

const peso = (n: number) => `₱${n}`;
const drawer = (over: Partial<CashDrawer>): CashDrawer => ({
  id: "d1", outletId: null, name: "Cashier 1", startingCash: 2000, isZeroBalance: false, sortOrder: 0, ...over,
});

describe("suggestDrawerName", () => {
  it("offers the next free Cashier number", () => {
    expect(suggestDrawerName([])).toBe("Cashier 1");
    expect(suggestDrawerName([{ name: "Cashier 1" }])).toBe("Cashier 2");
    expect(suggestDrawerName([{ name: "cashier 2" }])).toBe("Cashier 1");
  });
});

describe("canManageCash", () => {
  it("lets owners, full-access admins and store_setup holders manage cash, not plain cashiers", () => {
    expect(canManageCash({ role: "admin", isOwner: true, permissions: [] })).toBe(true);
    expect(canManageCash({ role: "admin", isOwner: false, permissions: null })).toBe(true);
    expect(canManageCash({ role: "admin", isOwner: false, permissions: ["pos", "store_setup"] })).toBe(true);
    expect(canManageCash({ role: "admin", isOwner: false, permissions: ["pos", "orders"] })).toBe(false);
  });
});

describe("validateDrawerInput", () => {
  it("trims the name and keeps the starting cash", () => {
    expect(validateDrawerInput({ name: "  Cashier 2 ", startingCash: 1500, isZeroBalance: false }, [])).toEqual({
      ok: true, value: { name: "Cashier 2", startingCash: 1500, isZeroBalance: false },
    });
  });

  it("forces a zero-balance drawer's starting cash to 0 instead of refusing it", () => {
    const v = validateDrawerInput({ name: "Owner drawer", startingCash: 500, isZeroBalance: true }, []);
    expect(v).toEqual({ ok: true, value: { name: "Owner drawer", startingCash: 0, isZeroBalance: true } });
  });

  it("refuses a blank name, a duplicate name and a negative float", () => {
    expect(validateDrawerInput({ name: " ", startingCash: 0, isZeroBalance: false }, [])).toMatchObject({ ok: false, field: "name" });
    expect(validateDrawerInput({ name: "cashier 1", startingCash: 0, isZeroBalance: false }, [drawer({})])).toMatchObject({ ok: false, field: "name" });
    expect(validateDrawerInput({ name: "X", startingCash: -1, isZeroBalance: false }, [])).toMatchObject({ ok: false, field: "startingCash" });
    expect(validateDrawerInput({ name: "X", startingCash: Number.NaN, isZeroBalance: false }, [])).toMatchObject({ ok: false, field: "startingCash" });
  });

  it("lets a drawer keep its own name when edited", () => {
    expect(validateDrawerInput({ name: "Cashier 1", startingCash: 0, isZeroBalance: false }, [drawer({})], "d1").ok).toBe(true);
  });
});

describe("drawerBoard", () => {
  const drawers = [drawer({ id: "b", name: "Cashier 2", sortOrder: 1 }), drawer({ id: "a", sortOrder: 0 }), drawer({ id: "z", name: "Owner", sortOrder: 2, isZeroBalance: true, startingCash: 0 })];
  const open = [
    { shiftId: "s1", drawerId: "a", staffUserId: "ana", staffName: "Ana" },
    { shiftId: "s2", drawerId: "z", staffUserId: "me", staffName: "Me" },
    { shiftId: "s3", drawerId: null, staffUserId: "ben", staffName: "Ben" },
  ];

  it("orders tills and says who holds each", () => {
    const board = drawerBoard(drawers, open, "me");
    expect(board.map((s) => [s.drawer.id, s.state])).toEqual([["a", "taken"], ["b", "free"], ["z", "mine"]]);
    expect(board[0]).toMatchObject({ heldBy: "Ana", shiftId: "s1" });
  });

  it("lands a cashier on the first free till", () => {
    expect(defaultDrawerChoice(drawerBoard(drawers, open, "me"))).toBe("b");
    expect(defaultDrawerChoice(drawerBoard([drawers[1]], open, "me"))).toBeNull();
  });
});

describe("describeDrawerPolicy", () => {
  it("phrases each policy", () => {
    expect(describeDrawerPolicy({ isZeroBalance: true, startingCash: 0 }, peso)).toMatch(/Zero balance/);
    expect(describeDrawerPolicy({ isZeroBalance: false, startingCash: 2000 }, peso)).toBe("Starts with ₱2000 float");
    expect(describeDrawerPolicy({ isZeroBalance: false, startingCash: 0 }, peso)).toBe("No standard float");
  });
});

describe("summarizeCashMoves", () => {
  it("adds each kind on its own, to the centavo", () => {
    expect(summarizeCashMoves([
      { kind: "collect", amount: 1000 }, { kind: "collect", amount: 0.1 }, { kind: "pay_out", amount: 0.2 },
      { kind: "pay_in", amount: 500 },
    ])).toEqual({ payIn: 500, payOut: 0.2, collected: 1000.1 });
  });
});

describe("validateCashMove", () => {
  it("accepts a pickup without a note", () => {
    expect(validateCashMove({ kind: "collect", amount: 1000, reason: " " }, 4000)).toEqual({
      ok: true, value: { kind: "collect", amount: 1000, reason: null },
    });
  });

  it("requires a reason for pay outs and pay ins", () => {
    expect(validateCashMove({ kind: "pay_out", amount: 50, reason: "" }, 4000)).toMatchObject({ ok: false });
    expect(validateCashMove({ kind: "pay_in", amount: 50, reason: "" }, 4000)).toMatchObject({ ok: false });
    expect(validateCashMove({ kind: "pay_out", amount: 50, reason: "Ice" }, 4000).ok).toBe(true);
  });

  it("refuses taking out more than the drawer should hold, but not adding to it", () => {
    expect(validateCashMove({ kind: "collect", amount: 5000, reason: "" }, 4000)).toMatchObject({ ok: false });
    expect(validateCashMove({ kind: "pay_in", amount: 5000, reason: "Coins" }, 4000).ok).toBe(true);
    // Unknown expectation (history still loading) cannot be used to refuse.
    expect(validateCashMove({ kind: "collect", amount: 5000, reason: "" }, null).ok).toBe(true);
  });

  it("refuses zero, negative and non-numeric amounts", () => {
    for (const amount of [0, -5, Number.NaN]) {
      expect(validateCashMove({ kind: "collect", amount, reason: "" }, null).ok).toBe(false);
    }
  });
});
