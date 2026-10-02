import { expectDrawer, INCOMPLETE_HISTORY_MESSAGE } from "./drawer-expectation";
import type { ShiftRecord } from "./shift-service";

const shift = (over: Partial<ShiftRecord> = {}): ShiftRecord => ({
  id: "s1", outletId: null, staffUserId: "ana", staffName: "Ana", status: "open", openingFloat: 1000,
  expectedCash: null, closingCount: null, note: null, openedAt: "2026-10-01T01:00:00Z", closedAt: null,
  drawerId: "d1", drawerName: "Cashier 1", isZeroBalance: false, closedByName: null, ...over,
});
const at = (iso: string) => Date.parse(iso);
const sale = (id: string, cashier: string, total: number, when = "2026-10-01T02:00:00Z") => ({
  _id: id, _creationTime: at(when), source: "pos", status: "delivered", total, paymentMethod: "Cash",
  customerData: { pos: { cashierId: cashier } },
});
const base = {
  orders: [sale("o1", "ana", 500), sale("o2", "ben", 900), sale("old", "ana", 50, "2026-09-30T02:00:00Z")],
  payments: [], pageLimit: 200, ledgerReady: true, ledgerError: null,
  moves: [
    { id: "m1", shiftId: "s1", kind: "collect" as const, amount: 300, reason: null, recordedByName: "Owner", createdAt: "" },
    { id: "m2", shiftId: "other", kind: "collect" as const, amount: 999, reason: null, recordedByName: "Owner", createdAt: "" },
  ],
  nowMs: at("2026-10-01T05:00:00Z"),
};

it("counts only this cashier's sales in the window and only this shift's moves", () => {
  const read = expectDrawer(shift(), base);
  expect(read.state).toBe("ready");
  if (read.state !== "ready") return;
  expect(read.value.summary.cashTotal).toBe(500);
  expect(read.value.moves.collected).toBe(300);
  expect(read.value.reconciliation.expectedInDrawer).toBe(1200);
  expect(read.value.reconciliation.expectedTurnover).toBe(200);
});

it("hands over the whole drawer for a zero-balance shift", () => {
  const read = expectDrawer(shift({ openingFloat: 0, isZeroBalance: true }), base);
  if (read.state !== "ready") throw new Error("not ready");
  expect(read.value.reconciliation.expectedTurnover).toBe(200);
  expect(read.value.reconciliation.floatToKeep).toBe(0);
});

it("waits for the ledger and the moves, and says why it cannot reconcile", () => {
  expect(expectDrawer(shift(), { ...base, ledgerReady: false }).state).toBe("loading");
  expect(expectDrawer(shift(), { ...base, moves: null }).state).toBe("loading");
  expect(expectDrawer(shift(), { ...base, ledgerError: "Offline" })).toEqual({ state: "unavailable", reason: "Offline" });
  expect(expectDrawer(shift(), { ...base, pageLimit: 3, orders: base.orders.slice(0, 3).map((o) => ({ ...o, _creationTime: at("2026-10-01T02:00:00Z") })) }))
    .toEqual({ state: "unavailable", reason: INCOMPLETE_HISTORY_MESSAGE });
});

it("attributes nothing to a shift whose account was removed", () => {
  const read = expectDrawer(shift({ staffUserId: null }), base);
  if (read.state !== "ready") throw new Error("not ready");
  expect(read.value.summary.cashTotal).toBe(0);
});
