import {
  applyPosVouchers,
  manualDiscountLine,
  posDiscountContext,
  validateManualDiscount,
  type ManualDiscount,
} from "./pos-discount";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * Discounting at the register.
 *
 * Two very different things share this module. A VOUCHER is a rule the merchant
 * wrote in advance and the engine evaluates — the cashier only types a code. A
 * MANUAL discount is the cashier deciding, at the counter, to take money off.
 *
 * The second is a till-skimming vector, so it is gated on a permission and
 * refuses to exist without a reason. That audit trail is what makes local
 * pricing safe: the register computes its own total (it must work on a flaky
 * connection), so the defence against a forced discount is not arithmetic — it
 * is knowing who did it and why.
 */

const line = (id: string, subtotal: number, menuItemId = "m-1"): PosCartLine =>
  ({
    key: id,
    menuItemId,
    menuItemName: "Latte",
    basePrice: subtotal,
    quantity: 1,
    subtotal,
    selections: [],
  }) as unknown as PosCartLine;

const NOW = new Date("2026-08-03T02:00:00Z");

const baseVoucher: Voucher = {
  id: "v-1",
  code: "WELCOME10",
  name: "Welcome 10%",
  discountType: "percent",
  discountValue: 10,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const owner = { role: "admin", isOwner: true, permissions: null };
const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
const supervisor = { role: "admin", isOwner: false, permissions: ["pos", "vouchers"] };

describe("posDiscountContext", () => {
  it("describes the cart in the engine's vocabulary", () => {
    const context = posDiscountContext([line("a", 100), line("b", 50)], 15, NOW);

    expect(context.channel).toBe("pos");
    expect(context.serviceCharge).toBe(15);
    expect(context.lines).toHaveLength(2);
    expect(context.now).toBe(NOW);
  });

  it("reports no delivery fee, because a counter sale has none", () => {
    // free_delivery vouchers must therefore find nothing to discount.
    expect(posDiscountContext([line("a", 100)], 0, NOW).deliveryFee).toBe(0);
  });

  it("carries the branch, so a branch-locked voucher is refused elsewhere", () => {
    const context = posDiscountContext([line("a", 100)], 0, NOW, "outlet-2");

    expect(context.outletId).toBe("outlet-2");
  });
});

describe("applyPosVouchers", () => {
  it("applies a valid voucher to the counter sale", () => {
    const result = applyPosVouchers(
      [baseVoucher],
      posDiscountContext([line("a", 200)], 0, NOW),
    );

    expect(result.discountTotal).toBe(20);
    expect(result.discountLines[0].code).toBe("WELCOME10");
  });

  it("refuses a voucher that is not valid at the register", () => {
    const onlineOnly = { ...baseVoucher, channels: ["checkout"] as const };

    const result = applyPosVouchers(
      [onlineOnly],
      posDiscountContext([line("a", 200)], 0, NOW),
    );

    expect(result.discountLines).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("wrong_channel");
  });
});

describe("validateManualDiscount", () => {
  const fixed: ManualDiscount = { kind: "fixed", value: 50, reason: "Damaged item" };

  it("lets a supervisor discount", () => {
    expect(validateManualDiscount(fixed, supervisor).isAllowed).toBe(true);
  });

  it("lets the owner discount", () => {
    expect(validateManualDiscount(fixed, owner).isAllowed).toBe(true);
  });

  it("refuses a cashier without the vouchers permission", () => {
    const verdict = validateManualDiscount(fixed, cashier);

    expect(verdict.isAllowed).toBe(false);
    expect(verdict.message).toMatch(/permission/i);
  });

  it("refuses a discount with no reason given", () => {
    const verdict = validateManualDiscount({ ...fixed, reason: "" }, supervisor);

    expect(verdict.isAllowed).toBe(false);
    expect(verdict.message).toMatch(/reason/i);
  });

  it("refuses a reason that is only whitespace", () => {
    const verdict = validateManualDiscount({ ...fixed, reason: "   " }, supervisor);

    expect(verdict.isAllowed).toBe(false);
  });

  it("refuses a zero or negative amount", () => {
    expect(validateManualDiscount({ ...fixed, value: 0 }, supervisor).isAllowed).toBe(false);
    expect(validateManualDiscount({ ...fixed, value: -5 }, supervisor).isAllowed).toBe(false);
  });

  it("refuses a non-finite amount", () => {
    expect(
      validateManualDiscount({ ...fixed, value: Number.NaN }, supervisor).isAllowed,
    ).toBe(false);
  });

  it("refuses a percentage over 100 rather than making the sale free", () => {
    // A cashier meaning 10.00 and typing 1000 should be stopped, not obeyed.
    const verdict = validateManualDiscount(
      { kind: "percent", value: 1000, reason: "typo" },
      supervisor,
    );

    expect(verdict.isAllowed).toBe(false);
  });

  it("allows exactly 100 percent — a full comp is a real thing", () => {
    expect(
      validateManualDiscount(
        { kind: "percent", value: 100, reason: "Staff meal" },
        supervisor,
      ).isAllowed,
    ).toBe(true);
  });
});

describe("manualDiscountLine", () => {
  it("takes a fixed amount off", () => {
    const result = manualDiscountLine(
      { kind: "fixed", value: 50, reason: "Damaged item" },
      500,
    );

    expect(result?.amount).toBe(50);
  });

  it("computes a percentage of the chargeable amount", () => {
    const result = manualDiscountLine(
      { kind: "percent", value: 10, reason: "Regular" },
      500,
    );

    expect(result?.amount).toBe(50);
  });

  it("labels the line with the reason, so the receipt explains itself", () => {
    const result = manualDiscountLine(
      { kind: "fixed", value: 50, reason: "Damaged item" },
      500,
    );

    expect(result?.label).toContain("Damaged item");
  });

  it("carries no voucher id, because no redemption is burned", () => {
    const result = manualDiscountLine({ kind: "fixed", value: 50, reason: "x" }, 500);

    expect(result?.voucherId).toBeUndefined();
    expect(result?.code).toBeUndefined();
  });

  it("caps a fixed amount at the sale, never a payout", () => {
    const result = manualDiscountLine(
      { kind: "fixed", value: 900, reason: "Comp" },
      500,
    );

    expect(result?.amount).toBe(500);
  });

  it("rounds a percentage to centavos", () => {
    const result = manualDiscountLine(
      { kind: "percent", value: 33, reason: "x" },
      100.1,
    );

    expect(result?.amount).toBe(33.03);
  });

  it("returns nothing for an invalid discount rather than a zero line", () => {
    // A zero-peso line printed on a receipt is worse than no line.
    expect(manualDiscountLine({ kind: "fixed", value: 0, reason: "x" }, 500)).toBeNull();
  });
});
