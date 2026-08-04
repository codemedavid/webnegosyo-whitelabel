import { readFileSync } from "fs";
import { join } from "path";

import {
  EMPTY_POS_DISCOUNT_SESSION,
  addSessionVoucher,
  discountAfterCartChange,
} from "./pos-discount-session";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * A discount belongs to a SALE, and an emptied cart is the end of one.
 *
 * `reset()` — the Clear button — already knows this: it drops the held
 * vouchers with the lines, because a voucher left behind is money given to the
 * next customer, who never presented a code. But the − stepper empties a cart
 * too. `updateQty(key, 0)` removes the line, so the register reaches zero lines
 * without Clear ever being pressed, and the session survived.
 *
 * The cashier cannot see it happen: the discount rows live inside the cart
 * sheet's collapsed totals block, so the only symptom is a quietly-low Charge.
 */

const welcome10: Voucher = {
  id: "v-welcome",
  code: "WELCOME10",
  name: "10% off",
  discountType: "percent",
  discountValue: 10,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos"],
  isActive: true,
};

const held = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, welcome10);

const line = (): PosCartLine =>
  ({
    key: "a",
    menuItemId: "m-latte",
    name: "Latte",
    basePrice: 100,
    quantity: 1,
    unitPrice: 100,
    subtotal: 100,
    selections: [],
  }) as PosCartLine;

describe("discountAfterCartChange", () => {
  it("drops the session when the change emptied the cart", () => {
    expect(discountAfterCartChange(held, [])).toEqual(EMPTY_POS_DISCOUNT_SESSION);
  });

  it("keeps the session while the sale still has lines", () => {
    // Voiding one line of several is not the end of the sale.
    expect(discountAfterCartChange(held, [line()])).toBe(held);
  });

  it("leaves an already-empty session alone", () => {
    expect(discountAfterCartChange(EMPTY_POS_DISCOUNT_SESSION, [])).toBe(
      EMPTY_POS_DISCOUNT_SESSION,
    );
  });
});

/**
 * The store is not unit-testable here — Jest is scoped to `lib/` and `theme/`
 * — so the decision lives in the helper above and this reads the wiring.
 */
describe("the register cart store", () => {
  const source = readFileSync(
    join(__dirname, "..", "stores", "pos-cart-store.ts"),
    "utf8",
  );

  it("runs every quantity change through the helper", () => {
    // `updateQty(key, 0)` removes the line, so setQty empties carts too.
    expect(source).toMatch(/setQty:[\s\S]{0,320}discountAfterCartChange/);
  });

  it("runs every line removal through the helper", () => {
    expect(source).toMatch(/remove:[\s\S]{0,320}discountAfterCartChange/);
  });

  it("clears the session when a placed order is loaded for editing", () => {
    // A voucher held for a counter sale would otherwise render a phantom
    // discount row on somebody's already-paid order.
    expect(source).toMatch(/beginEdit:[\s\S]{0,320}EMPTY_POS_DISCOUNT_SESSION/);
  });
});
