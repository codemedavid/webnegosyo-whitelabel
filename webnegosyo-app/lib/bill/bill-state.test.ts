import { billCollectGate, parseBillOrderIds, resolveBill } from "./bill-state";
import { ROUND_ONE } from "./bill-fixtures";

const detail = {
  _id: "o1",
  _creationTime: 1,
  customerName: "Maria",
  customerContact: "",
  status: "delivered",
  paymentStatus: "pending",
  total: 300,
  customerData: { table_number: "4" },
  items: [],
};
const owner = { role: "admin", isOwner: true, permissions: [] };

describe("parseBillOrderIds", () => {
  it("reads a comma list, dropping blanks and repeats", () => {
    expect(parseBillOrderIds(" a,b,,a ")).toEqual(["a", "b"]);
    expect(parseBillOrderIds(undefined)).toEqual([]);
    expect(parseBillOrderIds(["a,b"])).toEqual(["a", "b"]);
  });
});

describe("resolveBill", () => {
  it("waits until every order and its ledger has arrived", () => {
    expect(resolveBill(["o1", "o2"], { o1: { order: detail, payments: [], ledger: "available", error: null } }).status).toBe(
      "loading",
    );
  });

  it("fails on an order that did not load", () => {
    const state = resolveBill(["o1"], { o1: { order: null, payments: [], ledger: "available", error: "boom" } });

    expect(state).toEqual({ status: "error", message: "boom" });
  });

  it("fails on a ledger that could not be read, rather than guessing it is unpaid", () => {
    const state = resolveBill(["o1"], { o1: { order: detail, payments: undefined, ledger: "unavailable", error: null } });

    expect(state.status).toBe("error");
  });

  it("is ready once everything is read", () => {
    const state = resolveBill(["o1"], { o1: { order: detail, payments: [], ledger: "available", error: null } });

    expect(state.status === "ready" && state.orders[0].amountPaid).toBe(0);
  });
});

describe("billCollectGate", () => {
  const base = { orders: [ROUND_ONE], ledgers: { "order-a": "available" as const }, backend: "platform" as const, user: owner, isDemo: false };

  it("lets an owner collect on an owing bill", () => {
    expect(billCollectGate(base)).toEqual({ allowed: true });
  });

  it("refuses in demo mode", () => {
    expect(billCollectGate({ ...base, isDemo: true }).allowed).toBe(false);
  });

  it("refuses with the first owing order's own reason", () => {
    const gate = billCollectGate({ ...base, user: { role: "staff", isOwner: false, permissions: ["orders"] } });

    expect(gate).toEqual({ allowed: false, reason: "You do not have permission to take payments." });
  });

  it("has nothing to collect on a paid bill", () => {
    expect(billCollectGate({ ...base, orders: [{ ...ROUND_ONE, amountPaid: 340 }] }).allowed).toBe(false);
  });
});
