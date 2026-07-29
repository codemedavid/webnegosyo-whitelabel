/**
 * The money math behind editing a placed order.
 *
 * Every "do we collect more, refund, or are we square?" decision in the edit
 * flow routes through these functions, so they are tested exhaustively —
 * including the float drift that ₱-denominated arithmetic produces.
 */

import {
  amountPaid,
  computeBalance,
  settlementIntent,
  type OrderPayment,
} from "./order-balance";

const charge = (amount: number): OrderPayment => ({ kind: "charge", amount });
const refund = (amount: number): OrderPayment => ({ kind: "refund", amount });

describe("amountPaid", () => {
  it("is zero for an order with no payments recorded", () => {
    expect(amountPaid([])).toBe(0);
  });

  it("sums charges", () => {
    expect(amountPaid([charge(100), charge(50.5)])).toBe(150.5);
  });

  it("subtracts refunds from charges", () => {
    expect(amountPaid([charge(500), refund(120)])).toBe(380);
  });

  it("rounds float drift to centavos", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE 754
    expect(amountPaid([charge(0.1), charge(0.2)])).toBe(0.3);
  });

  it("goes negative when refunds exceed charges", () => {
    // An over-refund is a real bookkeeping state, not something to clamp away.
    expect(amountPaid([charge(100), refund(150)])).toBe(-50);
  });

  it("ignores non-finite amounts rather than poisoning the total with NaN", () => {
    expect(amountPaid([charge(100), charge(Number.NaN)])).toBe(100);
  });
});

describe("computeBalance", () => {
  it("is the full total when nothing has been paid", () => {
    expect(computeBalance(450, [])).toBe(450);
  });

  it("is zero when the order is paid exactly", () => {
    expect(computeBalance(450, [charge(450)])).toBe(0);
  });

  it("is positive when an edit raised the total above what was paid", () => {
    // Paid ₱450 by GCash, then staff added a ₱120 item.
    expect(computeBalance(570, [charge(450)])).toBe(120);
  });

  it("is negative when an edit dropped the total below what was paid", () => {
    // Paid ₱450 by GCash, then staff removed a ₱120 item — ₱120 owed back.
    expect(computeBalance(330, [charge(450)])).toBe(-120);
  });

  it("accounts for a refund already issued", () => {
    expect(computeBalance(330, [charge(450), refund(120)])).toBe(0);
  });

  it("rounds to centavos so a settled order never shows a phantom balance", () => {
    expect(computeBalance(0.3, [charge(0.1), charge(0.2)])).toBe(0);
  });
});

describe("settlementIntent", () => {
  it("collects when money is still owed", () => {
    expect(settlementIntent(120)).toBe("collect");
  });

  it("refunds when the customer overpaid", () => {
    expect(settlementIntent(-120)).toBe("refund");
  });

  it("is settled at exactly zero", () => {
    expect(settlementIntent(0)).toBe("settled");
  });

  it("treats a sub-centavo balance as settled", () => {
    // Never ask a cashier to collect ₱0.004.
    expect(settlementIntent(0.004)).toBe("settled");
    expect(settlementIntent(-0.004)).toBe("settled");
  });

  it("does not treat a single centavo as settled", () => {
    expect(settlementIntent(0.01)).toBe("collect");
    expect(settlementIntent(-0.01)).toBe("refund");
  });
});
