jest.mock("./gov-ledger/approval-client", () => ({
  callWebRoute: jest.fn(),
  messageOf: (json: Record<string, unknown>, fallback: string) =>
    typeof json.error === "string" && json.error.trim() !== "" ? json.error : fallback,
}));

import {
  clearanceLines,
  forgetStockPolicies,
  knownStockPolicy,
  readClearanceAnswer,
  rememberStockPolicy,
  shouldAskForClearance,
  withOfflineStockCheck,
  withoutCustomerStockCheck,
} from "./pos-stock-clearance";

const DISH = "11111111-0000-4000-8000-000000000001";

describe("stock policy memo", () => {
  beforeEach(() => forgetStockPolicies());

  it("knows nothing until the server said so, then remembers per store", () => {
    expect(knownStockPolicy("t1")).toBeUndefined();
    rememberStockPolicy("t1", "warn");
    rememberStockPolicy("t2", "block");
    expect(knownStockPolicy("t1")).toBe("warn");
    expect(knownStockPolicy("t2")).toBe("block");
  });
});

describe("shouldAskForClearance", () => {
  it("asks on a platform store unless it is known to warn, and never offline", () => {
    expect(shouldAskForClearance({ isPlatform: true, policy: "block", isOffline: false })).toBe("ask");
    expect(shouldAskForClearance({ isPlatform: true, policy: undefined, isOffline: false })).toBe("ask");
    expect(shouldAskForClearance({ isPlatform: true, policy: "warn", isOffline: false })).toBe("skip");
    expect(shouldAskForClearance({ isPlatform: false, policy: "block", isOffline: false })).toBe("skip");
    // Offline: the sale is kept and marked, so the owner sees it if it oversold.
    expect(shouldAskForClearance({ isPlatform: true, policy: "block", isOffline: true })).toBe("offline");
    expect(shouldAskForClearance({ isPlatform: true, policy: undefined, isOffline: true })).toBe("offline");
    expect(shouldAskForClearance({ isPlatform: true, policy: "warn", isOffline: true })).toBe("skip");
  });
});

describe("clearanceLines", () => {
  it("sends the stock items the order will hold, dropping what the database stores as no dish", () => {
    expect(
      clearanceLines([
        { menuItemId: DISH, quantity: 2, optionIds: ["o1"], addonIds: ["o1"], addonQuantities: { o1: 2 } },
        { menuItemId: "convex-id", quantity: 1, optionIds: [] },
        { menuItemId: DISH, quantity: 0, optionIds: [] },
        { menuItemId: DISH, quantity: 1.5, optionIds: [] },
      ]),
    ).toEqual([{ menuItemId: DISH, quantity: 2, optionIds: ["o1"], addonIds: ["o1"], addonQuantities: { o1: 2 } }]);
  });
});

describe("offline marker", () => {
  it("stamps pos.stockCheck without touching the rest (a new object)", () => {
    const data = { pos: { method: "cash", cashierId: "u1" }, outlet: { id: "b1" } };
    const stamped = withOfflineStockCheck(data);
    expect(stamped).toEqual({ pos: { method: "cash", cashierId: "u1", stockCheck: "offline" }, outlet: { id: "b1" } });
    expect(data.pos).toEqual({ method: "cash", cashierId: "u1" });
    expect(withOfflineStockCheck(undefined)).toEqual({ pos: { stockCheck: "offline" } });
  });

  it("a customer's QR can never claim the register was offline", () => {
    expect(withoutCustomerStockCheck({ pos: { stockCheck: "offline", x: 1 }, a: 2 })).toEqual({ pos: { x: 1 }, a: 2 });
    expect(withoutCustomerStockCheck({ a: 2 })).toEqual({ a: 2 });
    expect(withoutCustomerStockCheck(undefined)).toEqual({});
  });
});

describe("readClearanceAnswer", () => {
  it("reads every answer the route gives", () => {
    expect(readClearanceAnswer(null)).toEqual({ kind: "unreachable" });
    expect(readClearanceAnswer({ ok: false, status: 503, json: {} })).toEqual({ kind: "unreachable" });
    expect(readClearanceAnswer({ ok: false, status: 401, json: {} })).toEqual({ kind: "unreachable" });
    expect(readClearanceAnswer({ ok: true, status: 200, json: { status: "not_required" } })).toEqual({ kind: "go", policy: "warn" });
    expect(readClearanceAnswer({ ok: true, status: 200, json: { status: "cleared", clearanceId: "c" } })).toEqual({
      kind: "go",
      policy: "block",
    });
    expect(
      readClearanceAnswer({ ok: true, status: 200, json: { status: "cleared", clearanceId: "c", outletId: "b1" } }),
    ).toEqual({ kind: "go", policy: "block", outletId: "b1" });
    expect(
      readClearanceAnswer({ ok: true, status: 200, json: { status: "approved", clearanceId: "c", approverName: "Lito" } }),
    ).toEqual({ kind: "go", policy: "block", approverName: "Lito" });
    expect(
      readClearanceAnswer({
        ok: false,
        status: 409,
        json: {
          status: "needs_manager",
          error: "Stock does not cover this sale.",
          shortfalls: [{ menuItemId: DISH, name: "Adobo", requested: 3, producible: 1 }, { bad: true }],
          approvers: [{ userId: "m", name: "Lito", hasPin: true }, { name: 3 }],
        },
      }),
    ).toEqual({
      kind: "needs_manager",
      message: "Stock does not cover this sale.",
      shortfalls: [{ menuItemId: DISH, name: "Adobo", requested: 3, producible: 1 }],
      approvers: [{ userId: "m", name: "Lito", hasPin: true }],
    });
    expect(readClearanceAnswer({ ok: false, status: 400, json: { error: "That PIN is not right. Try again." } })).toEqual({
      kind: "refused",
      message: "That PIN is not right. Try again.",
    });
    expect(readClearanceAnswer({ ok: true, status: 200, json: { status: "who knows" } })).toEqual({
      kind: "refused",
      message: "The stock check could not be confirmed. Try again.",
    });
  });
});

describe("requestStockClearance", () => {
  beforeEach(() => forgetStockPolicies());

  it("posts the sale to the route and remembers what the store's policy turned out to be", async () => {
    const { callWebRoute } = jest.requireMock("./gov-ledger/approval-client") as { callWebRoute: jest.Mock };
    const { requestStockClearance } = jest.requireActual("./pos-stock-clearance") as typeof import("./pos-stock-clearance");
    callWebRoute.mockResolvedValueOnce({ ok: true, status: 200, json: { status: "not_required" } });
    const ask = { tenantId: "t1", orderId: "o1", outletId: null, lines: [{ menuItemId: DISH, quantity: 1 }] };
    expect(await requestStockClearance(ask)).toEqual({ kind: "go", policy: "warn" });
    expect(callWebRoute).toHaveBeenCalledWith("/api/pos/stock-clearance", { method: "POST", body: ask });
    expect(knownStockPolicy("t1")).toBe("warn");

    callWebRoute.mockResolvedValueOnce({ ok: false, status: 409, json: { status: "needs_manager" } });
    expect((await requestStockClearance({ ...ask, tenantId: "t2" })).kind).toBe("needs_manager");
    expect(knownStockPolicy("t2")).toBe("block");

    callWebRoute.mockResolvedValueOnce(null);
    expect(await requestStockClearance({ ...ask, tenantId: "t3" })).toEqual({ kind: "unreachable" });
    expect(knownStockPolicy("t3")).toBeUndefined();
  });
});

describe("gateSaleStock", () => {
  beforeEach(() => forgetStockPolicies());
  const { gateSaleStock } = jest.requireActual("./pos-stock-clearance") as typeof import("./pos-stock-clearance");
  const base = {
    tenantId: "t1",
    orderId: "o1",
    outletId: null,
    isPlatform: true,
    lines: [{ menuItemId: DISH, quantity: 2 }],
    isApproved: false,
    isOffline: () => false,
  };

  it("asks the server online and writes the sale on its word", async () => {
    const request = jest.fn(async () => ({ kind: "go" as const, policy: "block" as const }));
    expect(await gateSaleStock({ ...base, request })).toEqual({ kind: "proceed", offline: false });
    expect(request).toHaveBeenCalledWith({ tenantId: "t1", orderId: "o1", outletId: null, lines: base.lines });
  });

  it("offline, or when the server cannot be reached, keeps the sale and marks it offline", async () => {
    const request = jest.fn(async () => ({ kind: "unreachable" as const }));
    expect(await gateSaleStock({ ...base, request })).toEqual({ kind: "proceed", offline: true });
    const never = jest.fn();
    expect(await gateSaleStock({ ...base, isOffline: () => true, request: never })).toEqual({ kind: "proceed", offline: true });
    expect(never).not.toHaveBeenCalled();
  });

  it("a clearance bound to another branch than the row will carry is not trusted: the sale is kept the offline way", async () => {
    const request = jest.fn(async () => ({ kind: "go" as const, policy: "block" as const, outletId: "branch-1" }));
    expect(await gateSaleStock({ ...base, request })).toEqual({ kind: "proceed", offline: true });
    const same = jest.fn(async () => ({ kind: "go" as const, policy: "block" as const, outletId: null }));
    expect(await gateSaleStock({ ...base, request: same })).toEqual({ kind: "proceed", offline: false });
  });

  it("hands a short sale to the manager PIN, and a refusal to the cashier", async () => {
    const short = { kind: "needs_manager" as const, message: "m", shortfalls: [], approvers: [] };
    expect(await gateSaleStock({ ...base, request: async () => short })).toEqual({ kind: "needs_manager", message: "m", shortfalls: [], approvers: [] });
    expect(await gateSaleStock({ ...base, request: async () => ({ kind: "refused" as const, message: "no" }) })).toEqual({ kind: "refused", message: "no" });
  });

  it("asks even for a sale with nothing stocked: the database still wants its clearance", async () => {
    const request = jest.fn(async () => ({ kind: "go" as const, policy: "block" as const }));
    expect(await gateSaleStock({ ...base, lines: [], request })).toEqual({ kind: "proceed", offline: false });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("never asks for a warn store, a Convex store or an approved sale", async () => {
    const request = jest.fn();
    rememberStockPolicy("t1", "warn");
    expect(await gateSaleStock({ ...base, request })).toEqual({ kind: "proceed", offline: false });
    forgetStockPolicies();
    expect(await gateSaleStock({ ...base, isPlatform: false, request })).toEqual({ kind: "proceed", offline: false });
    expect(await gateSaleStock({ ...base, isApproved: true, request })).toEqual({ kind: "proceed", offline: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps a sale the offline way when the approval itself could not reach the server", async () => {
    const request = jest.fn();
    expect(await gateSaleStock({ ...base, isApprovalUnreachable: true, request })).toEqual({ kind: "proceed", offline: true });
    expect(request).not.toHaveBeenCalled();
  });
});
