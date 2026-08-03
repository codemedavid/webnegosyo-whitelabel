import { previewSessionVoucher } from "./pos-voucher-entry";
import { EMPTY_POS_DISCOUNT_SESSION, addSessionVoucher } from "./pos-discount-session";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * Answering "why did nothing happen?" at the counter.
 *
 * A code can be found in the database and still be worth nothing on THIS sale:
 * fully claimed, expired, wrong branch, below its minimum, or refused because
 * a solo-only voucher is already applied. The engine decides all of that and
 * produces a sentence explaining it.
 *
 * Without this check the register accepted any code that merely EXISTS, added
 * it to the sale, and then quietly rendered no discount row — the cashier saw
 * the sheet close with nothing changed and had nothing to tell the customer.
 * The engine's message was being computed and dropped on the floor.
 *
 * The rejection is evaluated against the sale the voucher would join, which is
 * why the whole session and cart are needed rather than the voucher alone.
 */

const line = (id: string, subtotal: number): PosCartLine =>
  ({
    key: id,
    menuItemId: "m-1",
    menuItemName: "Latte",
    basePrice: subtotal,
    quantity: 1,
    subtotal,
    selections: [],
  }) as unknown as PosCartLine;

const NOW = new Date("2026-08-03T02:00:00Z");
const cart = [line("a", 200)];

const valid: Voucher = {
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

describe("previewSessionVoucher", () => {
  it("accepts a voucher that is worth something on this sale", () => {
    const verdict = previewSessionVoucher(
      EMPTY_POS_DISCOUNT_SESSION,
      valid,
      cart,
      0,
      NOW,
    );

    expect(verdict.isAccepted).toBe(true);
  });

  it("refuses a fully claimed voucher and says so", () => {
    // The engine already knows this; the register was throwing the answer away.
    const exhausted: Voucher = { ...valid, usageLimitTotal: 5, usedCount: 5 };

    const verdict = previewSessionVoucher(
      EMPTY_POS_DISCOUNT_SESSION,
      exhausted,
      cart,
      0,
      NOW,
    );

    expect(verdict.isAccepted).toBe(false);
    expect(verdict.message).toMatch(/claimed/i);
  });

  it("refuses an expired voucher and says so", () => {
    const expired: Voucher = { ...valid, endsAt: "2026-01-01T00:00:00Z" };

    const verdict = previewSessionVoucher(
      EMPTY_POS_DISCOUNT_SESSION,
      expired,
      cart,
      0,
      NOW,
    );

    expect(verdict.isAccepted).toBe(false);
    expect(verdict.message).toBeTruthy();
  });

  it("refuses a voucher below its minimum spend and says so", () => {
    const withMinimum: Voucher = { ...valid, minOrderAmount: 500 };

    const verdict = previewSessionVoucher(
      EMPTY_POS_DISCOUNT_SESSION,
      withMinimum,
      cart,
      0,
      NOW,
    );

    expect(verdict.isAccepted).toBe(false);
    expect(verdict.message).toBeTruthy();
  });

  it("refuses a voucher locked to another branch", () => {
    const elsewhere: Voucher = { ...valid, outletIds: ["outlet-1"] };

    const verdict = previewSessionVoucher(
      EMPTY_POS_DISCOUNT_SESSION,
      elsewhere,
      cart,
      0,
      NOW,
      "outlet-2",
    );

    expect(verdict.isAccepted).toBe(false);
  });

  it("refuses a code already applied to this sale", () => {
    // Adding it is a silent no-op, so without this the cashier taps Apply and
    // sees nothing change with no explanation.
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, valid);

    const verdict = previewSessionVoucher(session, valid, cart, 0, NOW);

    expect(verdict.isAccepted).toBe(false);
    expect(verdict.message).toMatch(/already/i);
  });

  it("judges the voucher against the sale it would actually join", () => {
    // A solo-only voucher is fine alone and refused alongside another, so the
    // verdict cannot be reached from the voucher in isolation.
    const soloOnly: Voucher = { ...valid, id: "v-2", code: "SOLO", isStackable: false };

    expect(
      previewSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, soloOnly, cart, 0, NOW).isAccepted,
    ).toBe(true);

    const withExisting = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, valid);
    expect(previewSessionVoucher(withExisting, soloOnly, cart, 0, NOW).isAccepted).toBe(
      false,
    );
  });

  it("refuses a voucher that is valid but worth nothing here", () => {
    // A free-delivery code at a counter has no delivery to discount. Accepting
    // it would add a row worth zero and read as a broken discount.
    const freeDelivery: Voucher = { ...valid, discountType: "free_delivery" };

    const verdict = previewSessionVoucher(
      EMPTY_POS_DISCOUNT_SESSION,
      freeDelivery,
      cart,
      0,
      NOW,
    );

    expect(verdict.isAccepted).toBe(false);
  });
});
