/**
 * A scanned cart may only carry what the store is selling right now.
 *
 * The QR was built on the customer's phone, possibly minutes before a dish was
 * 86'd — and the old scan read only prices, so a sold-out dish (or a switched
 * off option) became a real order the kitchen could not make. The ONE "sold
 * out" switch applies here exactly as on the register grid, branch included.
 */

import {
  buildHandoffAvailability,
  describeSoldOutHandoff,
  findSoldOutHandoffLine,
  type HandoffMenuRow,
} from "./scan-handoff-availability";
import type { OutletMenuOverrideRow } from "./outlet-menu-overrides";
import type { QrOrderItemV1 } from "./qr-order-codec";

const row = (over: Partial<HandoffMenuRow> = {}): HandoffMenuRow => ({
  id: "m-latte",
  name: "Latte",
  price: 150,
  is_available: true,
  modifier_groups: [
    {
      id: "g-milk",
      name: "Milk",
      display_order: 0,
      min_select: 1,
      max_select: 1,
      options: [
        { id: "o-whole", name: "Whole", price_modifier: 0, display_order: 0 },
        { id: "o-oat", name: "Oat", price_modifier: 20, display_order: 1, is_available: false },
        { id: "o-soy", name: "Soy", price_modifier: 20, display_order: 2, stock_mode: "simple", stock_qty: 0 },
      ],
    },
  ],
  ...over,
});

const override = (over: Partial<OutletMenuOverrideRow>): OutletMenuOverrideRow => ({
  outlet_id: "o-north",
  menu_item_id: "m-latte",
  is_listed: true,
  is_available: true,
  price: null,
  discounted_price: null,
  discount_cleared: false,
  ...over,
});

const item = (over: Partial<QrOrderItemV1> = {}): QrOrderItemV1 => ({
  menuItemId: "m-latte",
  menuItemName: "Latte",
  quantity: 1,
  price: 150,
  subtotal: 150,
  ...over,
});

describe("findSoldOutHandoffLine", () => {
  it("lets through a dish and option that are on sale", () => {
    const availability = buildHandoffAvailability([row()], [], null);
    expect(findSoldOutHandoffLine([item({ optionIds: ["o-whole"] })], availability)).toBeNull();
  });

  it("refuses a dish the merchant switched off", () => {
    const availability = buildHandoffAvailability([row({ is_available: false })], [], null);
    expect(findSoldOutHandoffLine([item()], availability)).toEqual({
      itemName: "Latte",
      optionName: null,
      reason: "sold_out",
    });
  });

  it("refuses a switched-off or zero-stock option, by id", () => {
    const availability = buildHandoffAvailability([row()], [], null);

    expect(findSoldOutHandoffLine([item({ optionIds: ["o-oat"] })], availability)).toEqual(
      expect.objectContaining({ optionName: "Oat", reason: "option_sold_out" }),
    );
    expect(findSoldOutHandoffLine([item({ addonIds: ["o-soy"] })], availability)).toEqual(
      expect.objectContaining({ optionName: "Soy" }),
    );
  });

  it("applies the register's branch: 86'd there, or not carried there", () => {
    const offAtNorth = buildHandoffAvailability([row()], [override({ is_available: false })], "o-north");
    expect(findSoldOutHandoffLine([item()], offAtNorth)?.reason).toBe("sold_out");

    const notCarried = buildHandoffAvailability([row()], [override({ is_listed: false })], "o-north");
    expect(findSoldOutHandoffLine([item()], notCarried)?.reason).toBe("not_at_branch");

    const otherBranch = buildHandoffAvailability([row()], [override({ outlet_id: "o-south", is_available: false })], "o-north");
    expect(findSoldOutHandoffLine([item()], otherBranch)).toBeNull();
  });

  it("leaves an item the catalog does not know to the price check", () => {
    // `evaluateCartHandoff` refuses it as unknown; this is not the place.
    expect(findSoldOutHandoffLine([item({ menuItemId: "m-ghost" })], new Map())).toBeNull();
  });

  it("names the dish the customer sees in the message", () => {
    const availability = buildHandoffAvailability([row()], [], null);
    const found = findSoldOutHandoffLine([item({ optionIds: ["o-oat"] })], availability);
    expect(found && describeSoldOutHandoff(found)).toMatch(/Latte.*Oat.*sold out/);
  });
});
