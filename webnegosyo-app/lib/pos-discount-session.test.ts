import {
  EMPTY_POS_DISCOUNT_SESSION,
  addSessionVoucher,
  clearSessionManualDiscount,
  removeSessionVoucher,
  sessionDiscount,
  setSessionManualDiscount,
} from "./pos-discount-session";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * What the register is holding while a sale is being rung.
 *
 * This is the counter's answer to the checkout's `checkout-codes.ts`, and it
 * differs in one deliberate way. Online, a cart change INVALIDATES the discount
 * and the browser must re-ask the server, because the server is the only thing
 * that can price a code. At the counter the engine is local, so a cart change
 * simply RE-PRICES. There is no stale window to guard against and no "checking…"
 * state to sit in front of a queue.
 *
 * The consequence worth testing: a voucher can stop applying mid-sale — void a
 * line and a minimum spend stops being met — and that must show up immediately
 * rather than being billed anyway.
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

const tenPercent: Voucher = {
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

const supervisor = { role: "admin", isOwner: false, permissions: ["pos", "vouchers"] };

describe("addSessionVoucher", () => {
  it("holds the voucher so the sale can be priced with it", () => {
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent);

    expect(session.vouchers).toHaveLength(1);
  });

  it("does not add the same code twice", () => {
    // A cashier tapping Apply twice must not double the discount.
    const once = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent);
    const twice = addSessionVoucher(once, { ...tenPercent });

    expect(twice.vouchers).toHaveLength(1);
  });

  it("keeps entry order, which decides a solo-only conflict", () => {
    const second: Voucher = { ...tenPercent, id: "v-2", code: "SAVE20" };
    const session = addSessionVoucher(
      addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent),
      second,
    );

    expect(session.vouchers.map((v) => v.code)).toEqual(["WELCOME10", "SAVE20"]);
  });

  it("does not mutate the session it was given", () => {
    const before = EMPTY_POS_DISCOUNT_SESSION;
    addSessionVoucher(before, tenPercent);

    expect(before.vouchers).toHaveLength(0);
  });
});

describe("removeSessionVoucher", () => {
  it("drops the voucher by code", () => {
    const session = removeSessionVoucher(
      addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent),
      "WELCOME10",
    );

    expect(session.vouchers).toHaveLength(0);
  });

  it("ignores a code that was never applied", () => {
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent);

    expect(removeSessionVoucher(session, "NOPE").vouchers).toHaveLength(1);
  });
});

describe("sessionDiscount", () => {
  it("is nothing at all on a sale with no discount", () => {
    const result = sessionDiscount(EMPTY_POS_DISCOUNT_SESSION, [line("a", 200)], 0, NOW);

    expect(result.lines).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("prices a held voucher through the shared engine", () => {
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent);

    const result = sessionDiscount(session, [line("a", 200)], 0, NOW);

    expect(result.total).toBe(20);
    expect(result.lines[0].code).toBe("WELCOME10");
  });

  it("re-prices against the current cart instead of a remembered total", () => {
    // The whole point of local pricing: no stale preview to invalidate.
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent);

    expect(sessionDiscount(session, [line("a", 200)], 0, NOW).total).toBe(20);
    expect(sessionDiscount(session, [line("a", 500)], 0, NOW).total).toBe(50);
  });

  it("drops a voucher that stops qualifying when a line is voided", () => {
    // Void an item mid-sale and a minimum spend can stop being met. Billing
    // the discount anyway is money given away with no rule behind it.
    const withMinimum: Voucher = { ...tenPercent, minOrderAmount: 300 };
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, withMinimum);

    expect(sessionDiscount(session, [line("a", 400)], 0, NOW).total).toBe(40);

    const shrunk = sessionDiscount(session, [line("a", 100)], 0, NOW);
    expect(shrunk.total).toBe(0);
    expect(shrunk.rejected[0].reason).toBe("below_minimum");
  });

  it("reports why a voucher was refused, so the cashier can say", () => {
    const onlineOnly: Voucher = { ...tenPercent, channels: ["checkout"] };
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, onlineOnly);

    const result = sessionDiscount(session, [line("a", 200)], 0, NOW);

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("wrong_channel");
  });

  it("applies a manual discount to what the vouchers left", () => {
    // Sequential, matching how vouchers stack: 200 - 10% = 180, then 10% = 18.
    const session = setSessionManualDiscount(
      addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent),
      { kind: "percent", value: 10, reason: "Regular" },
    );

    const result = sessionDiscount(session, [line("a", 200)], 0, NOW);

    expect(result.total).toBe(38);
  });

  it("applies a manual discount on its own", () => {
    const session = setSessionManualDiscount(EMPTY_POS_DISCOUNT_SESSION, {
      kind: "fixed",
      value: 50,
      reason: "Damaged item",
    });

    const result = sessionDiscount(session, [line("a", 200)], 0, NOW);

    expect(result.total).toBe(50);
    expect(result.lines[0].label).toContain("Damaged item");
  });

  it("counts the service charge as discountable, matching the web total", () => {
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenPercent);

    expect(sessionDiscount(session, [line("a", 200)], 100, NOW).total).toBe(30);
  });

  it("never discounts more than the sale is worth", () => {
    const session = setSessionManualDiscount(EMPTY_POS_DISCOUNT_SESSION, {
      kind: "fixed",
      value: 900,
      reason: "Comp",
    });

    expect(sessionDiscount(session, [line("a", 200)], 0, NOW).total).toBe(200);
  });

  it("carries the branch, so a branch-locked voucher is refused elsewhere", () => {
    const branchLocked: Voucher = { ...tenPercent, outletIds: ["outlet-1"] };
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, branchLocked);

    expect(sessionDiscount(session, [line("a", 200)], 0, NOW, "outlet-2").total).toBe(0);
    expect(sessionDiscount(session, [line("a", 200)], 0, NOW, "outlet-1").total).toBe(20);
  });
});

describe("setSessionManualDiscount", () => {
  it("refuses a discount the staff member may not give", () => {
    // The permission check belongs with the entry point, not only the UI: a
    // hidden button is not a control.
    const verdict = setSessionManualDiscount(
      EMPTY_POS_DISCOUNT_SESSION,
      { kind: "fixed", value: 50, reason: "" },
      supervisor,
    );

    expect(verdict.manual).toBeNull();
  });

  it("accepts a valid discount from a permitted staff member", () => {
    const session = setSessionManualDiscount(
      EMPTY_POS_DISCOUNT_SESSION,
      { kind: "fixed", value: 50, reason: "Damaged item" },
      supervisor,
    );

    expect(session.manual).not.toBeNull();
  });

  it("clears a manual discount that was given by mistake", () => {
    const session = setSessionManualDiscount(EMPTY_POS_DISCOUNT_SESSION, {
      kind: "fixed",
      value: 50,
      reason: "Damaged item",
    });

    expect(clearSessionManualDiscount(session).manual).toBeNull();
  });
});
