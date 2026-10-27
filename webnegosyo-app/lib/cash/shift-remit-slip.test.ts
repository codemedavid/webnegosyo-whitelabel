import { farewell, remittanceSlipInput, slipBanner, slipNonCash } from "./shift-remit-slip";
import type { Remittance } from "./remittances";
import type { ShiftDetail } from "../shift-service";

const REMITTANCE: Remittance = {
  id: "r1",
  tenantId: "t1",
  outletId: null,
  kind: "shift",
  shiftId: "s1",
  movementId: null,
  businessDay: "2026-10-24",
  cashierUserId: "u-ana",
  cashierName: "Ana Reyes",
  handedOverCents: 634500,
  remittedTo: "u-maria",
  remittedToName: "Maria Santos",
  toSafe: false,
  status: "pending",
  receivedCents: null,
  receivedByName: null,
  receivedAt: null,
  acceptMethod: null,
  isSelfReceived: false,
  receiverNote: null,
  disputeReason: null,
  resolvedByName: null,
  resolvedAt: null,
  resolutionNote: null,
  createdAt: "2026-10-24T18:48:00Z",
  shift: {
    drawerName: "Cashier 1",
    openedAt: "2026-10-24T10:02:00Z",
    closedAt: "2026-10-24T18:48:00Z",
    countedCents: 834500,
    expectedCents: 846500,
    varianceReason: "wrong_change",
  },
};

const SHIFT = {
  id: "s1",
  openingFloat: 2000,
  note: "gave ₱100 extra to T4",
  closingNonCash: [{ key: "gcash", method: "GCash", expectedCents: 421000, slipCount: 14, check: "matches", declaredCents: 421000 }],
  closingDenominations: { b1000: 4, b500: 3 },
} as unknown as ShiftDetail;

describe("remittanceSlipInput", () => {
  it("reads the slip from the stored close and the shift's moves, cash sales derived back", () => {
    const input = remittanceSlipInput({
      remittance: REMITTANCE,
      shift: SHIFT,
      moves: [
        { kind: "pay_in", cents: 20000, at: "2026-10-24T10:20:00Z", takenByName: null },
        { kind: "pay_out", cents: 45000, at: "2026-10-24T12:15:00Z", takenByName: null },
        { kind: "collect", cents: 250000, at: "2026-10-24T13:40:00Z", takenByName: "Maria" },
      ],
    });
    expect(input).toMatchObject({
      startingCashCents: 200000,
      // 846,500 − 200,000 − 20,000 + 45,000 + 250,000
      cashSalesCents: 921500,
      payInCents: 20000,
      payOutCents: 45000,
      pickups: [{ cents: 250000, takenByName: "Maria", at: "2026-10-24T13:40:00Z" }],
      expectedCents: 846500,
      countedCents: 834500,
      reasonKey: "wrong_change",
      reasonNote: "gave ₱100 extra to T4",
      floatKeptCents: 200000,
      handedOverCents: 634500,
      nonCash: [{ label: "GCash", cents: 421000, count: 14, check: "matches", declaredCents: null }],
      denominations: { b1000: 4, b500: 3 },
      receiver: { name: "Maria Santos", status: "pending", how: null },
    });
  });

  it("passes on who added up the expected figure, for the 'Counted on this tablet' line", () => {
    expect(remittanceSlipInput({ remittance: REMITTANCE, shift: SHIFT, moves: [], expectedSource: "device" }).expectedSource).toBe("device");
    expect(remittanceSlipInput({ remittance: REMITTANCE, shift: SHIFT, moves: [] }).expectedSource).toBeNull();
  });

  it("prints the float the server stored as kept", () => {
    const input = remittanceSlipInput({ remittance: REMITTANCE, shift: { ...SHIFT, floatKeptCents: 150000 }, moves: [] });
    expect(input.floatKeptCents).toBe(150000);
  });

  it("leaves cash sales unknown when nobody knows what was expected", () => {
    const input = remittanceSlipInput({ remittance: { ...REMITTANCE, shift: { ...REMITTANCE.shift!, expectedCents: null } }, shift: SHIFT, moves: [] });
    expect(input.cashSalesCents).toBeNull();
  });

  it("skips non-cash rows it cannot read", () => {
    expect(slipNonCash([{ method: "Card" }, null, "x", { label: "Maya", expectedCents: 86000, check: "lost" }])).toEqual([
      { label: "Maya", cents: 86000, count: 0, check: "unchecked", declaredCents: null },
    ]);
    expect(slipNonCash(null)).toEqual([]);
  });
});

describe("slipBanner", () => {
  it("says who it is waiting for, or who took it and how", () => {
    expect(slipBanner(REMITTANCE)).toEqual({ tone: "waiting", title: "Waiting for Maria Santos to accept.", detail: "They got a notification." });
    expect(slipBanner({ ...REMITTANCE, toSafe: true, remittedToName: null }).title).toBe("In the store safe.");
    expect(
      slipBanner({ ...REMITTANCE, status: "accepted", acceptMethod: "pin", receivedByName: "Maria Santos", receivedAt: "2026-10-24T18:51:00Z" }).title,
    ).toBe("Accepted by Maria Santos with PIN, 2:51 AM");
    expect(slipBanner({ ...REMITTANCE, status: "disputed", receivedByName: "Maria", disputeReason: "₱45 less" })).toMatchObject({ tone: "problem", detail: "₱45 less" });
  });
});

describe("farewell", () => {
  it("thanks the cashier who just closed, by first name, and nobody else", () => {
    expect(farewell(REMITTANCE, "u-ana")).toBe("Your shift is closed. Salamat, Ana!");
    expect(farewell(REMITTANCE, "u-maria")).toBeNull();
    expect(farewell({ ...REMITTANCE, kind: "pickup" }, "u-ana")).toBeNull();
  });
});
