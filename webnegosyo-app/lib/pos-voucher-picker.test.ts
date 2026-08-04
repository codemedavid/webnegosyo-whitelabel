/**
 * Choosing a voucher from a list instead of remembering its code.
 *
 * The register only ever accepted a TYPED code, which assumes the cashier
 * knows what the shop is currently running. They frequently do not — the
 * promotions are set by the owner in the web admin, and a customer saying
 * "isn't there a student discount?" left the counter guessing at spellings.
 *
 * This module turns the merchant's voucher list into something choosable: what
 * each code is worth in one line, whether it can be used on THIS sale, and why
 * not when it cannot. It decides nothing about money — every usability verdict
 * comes from the same engine the typed-code path already goes through.
 */

import { buildVoucherChoices, voucherTerms } from "./pos-voucher-picker";
import type { Voucher } from "./vouchers/types";

const voucher = (overrides: Partial<Voucher>): Voucher => ({
  id: "v-save20",
  code: "SAVE20",
  name: "20% off",
  discountType: "percent",
  discountValue: 20,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
  ...overrides,
});

/** Everything is usable unless a test says otherwise. */
const acceptAll = () => ({ isAccepted: true });

describe("voucherTerms", () => {
  it("states a percentage voucher as a percentage off", () => {
    expect(voucherTerms(voucher({ discountType: "percent", discountValue: 20 }))).toBe("20% off");
  });

  it("states a fixed voucher in pesos", () => {
    expect(voucherTerms(voucher({ discountType: "fixed", discountValue: 50 }))).toBe("₱50.00 off");
  });

  it("states a free-delivery voucher without inventing an amount", () => {
    expect(voucherTerms(voucher({ discountType: "free_delivery", discountValue: 0 }))).toBe(
      "Free delivery",
    );
  });

  it("appends the minimum spend, because a code the sale cannot reach is the commonest refusal", () => {
    expect(
      voucherTerms(voucher({ discountType: "percent", discountValue: 20, minOrderAmount: 500 })),
    ).toBe("20% off · Min ₱500.00");
  });
});

describe("buildVoucherChoices", () => {
  it("marks a code already on the sale as applied rather than judging it again", () => {
    // Arrange: the engine would refuse a held code with "already applied" —
    // shown as a REASON that would read as if the voucher were broken.
    const held = voucher({ code: "SAVE20" });
    const judge = jest.fn(() => ({ isAccepted: false, message: "That code is already applied." }));

    // Act
    const [choice] = buildVoucherChoices([held], ["SAVE20"], judge);

    // Assert
    expect(choice.isApplied).toBe(true);
    expect(choice.reason).toBeUndefined();
    expect(judge).not.toHaveBeenCalled();
  });

  it("carries the engine's own sentence for a code that cannot be used on this sale", () => {
    // Arrange
    const tooSmall = voucher({ code: "BIG500", minOrderAmount: 500 });

    // Act
    const [choice] = buildVoucherChoices([tooSmall], [], () => ({
      isAccepted: false,
      message: "Spend ₱200.00 more to use this code.",
    }));

    // Assert
    expect(choice.isUsable).toBe(false);
    expect(choice.reason).toBe("Spend ₱200.00 more to use this code.");
  });

  it("offers a usable code with no reason attached", () => {
    const [choice] = buildVoucherChoices([voucher({})], [], acceptAll);

    expect(choice.isUsable).toBe(true);
    expect(choice.isApplied).toBe(false);
    expect(choice.reason).toBeUndefined();
  });

  it("puts what the cashier can act on first: applied, then usable, then refused", () => {
    // Arrange
    const refused = voucher({ id: "v-1", code: "REFUSED" });
    const usable = voucher({ id: "v-2", code: "USABLE" });
    const applied = voucher({ id: "v-3", code: "APPLIED" });

    // Act: a list as the database returns it — worst case first.
    const choices = buildVoucherChoices(
      [refused, usable, applied],
      ["APPLIED"],
      (candidate) =>
        candidate.code === "REFUSED"
          ? { isAccepted: false, message: "Expired." }
          : { isAccepted: true },
    );

    // Assert
    expect(choices.map((choice) => choice.voucher.code)).toEqual([
      "APPLIED",
      "USABLE",
      "REFUSED",
    ]);
  });

  it("hides a code that can never be presented at a counter", () => {
    // Arrange: an online-only voucher. Listing it invites the cashier to tap a
    // code the engine will always refuse as wrong_channel — noise that makes
    // the whole list look unreliable.
    const onlineOnly = voucher({ code: "WEBONLY", channels: ["checkout"] });

    // Act
    const choices = buildVoucherChoices([onlineOnly, voucher({})], [], acceptAll);

    // Assert
    expect(choices.map((choice) => choice.voucher.code)).toEqual(["SAVE20"]);
  });

  it("hides a switched-off code even when the fetch returned one", () => {
    // The list endpoint filters these out, but the picker is the thing the
    // cashier sees and must not depend on a query staying correct.
    const choices = buildVoucherChoices([voucher({ code: "OFF", isActive: false })], [], acceptAll);

    expect(choices).toEqual([]);
  });
});
