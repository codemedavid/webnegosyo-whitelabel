/**
 * How a voucher reads on the merchant's phone: which state it is in, which
 * filter it lands under, and the one-line phrases the list and the ticket use.
 *
 * Dates are built with the local-time constructor so the suite reads the same
 * in any timezone — the screens format with the device's clock, and so do
 * these helpers.
 */

import type { Voucher } from "../vouchers/types";
import {
  countByFilter,
  describeDiscount,
  describeRules,
  describeScope,
  describeWindow,
  discountHeadline,
  filterVouchers,
  usageProgress,
  voucherShareMessage,
  voucherStatus,
} from "./voucher-status";

const NOW = new Date(2026, 8, 26, 12, 0, 0);

function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: "v1",
    code: "SAVE10",
    name: "Launch week",
    discountType: "percent",
    discountValue: 10,
    maxDiscountAmount: null,
    minOrderAmount: 0,
    scope: "universal",
    isStackable: false,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    usedCount: 0,
    startsAt: null,
    endsAt: null,
    channels: ["checkout", "pos", "admin"],
    outletIds: null,
    isActive: true,
    ...overrides,
  };
}

describe("voucherStatus", () => {
  it("is live when switched on, inside its window and under its limit", () => {
    expect(voucherStatus(voucher(), NOW)).toBe("live");
  });

  it("is retired when switched off, whatever else is true", () => {
    const retired = voucher({ isActive: false, usageLimitTotal: 1, usedCount: 1 });
    expect(voucherStatus(retired, NOW)).toBe("retired");
  });

  it("is used up once every allowed use is spent", () => {
    expect(voucherStatus(voucher({ usageLimitTotal: 5, usedCount: 5 }), NOW)).toBe("used_up");
  });

  it("is expired after its end date", () => {
    const ended = voucher({ endsAt: new Date(2026, 8, 25, 23, 59).toISOString() });
    expect(voucherStatus(ended, NOW)).toBe("expired");
  });

  it("is scheduled before its start date", () => {
    const later = voucher({ startsAt: new Date(2026, 9, 1).toISOString() });
    expect(voucherStatus(later, NOW)).toBe("scheduled");
  });

  it("treats an unreadable date as absent rather than as expired", () => {
    expect(voucherStatus(voucher({ endsAt: "not a date" }), NOW)).toBe("live");
  });
});

describe("filters", () => {
  const list = [
    voucher({ id: "live", code: "LIVE" }),
    voucher({ id: "soon", code: "SOON", startsAt: new Date(2026, 9, 1).toISOString() }),
    voucher({ id: "off", code: "OFF", name: "Old promo", isActive: false }),
    voucher({ id: "gone", code: "GONE", usageLimitTotal: 1, usedCount: 1 }),
  ];

  it("counts live, upcoming and ended vouchers", () => {
    expect(countByFilter(list, NOW)).toEqual({ live: 1, upcoming: 1, ended: 2, all: 4 });
  });

  it("puts used-up and retired codes under ended", () => {
    const ids = filterVouchers(list, "ended", "", NOW).map((v) => v.id);
    expect(ids).toEqual(["off", "gone"]);
  });

  it("searches the code and the name, ignoring case", () => {
    expect(filterVouchers(list, "all", "old", NOW).map((v) => v.id)).toEqual(["off"]);
    expect(filterVouchers(list, "all", "soo", NOW).map((v) => v.id)).toEqual(["soon"]);
  });

  it("returns a new array and leaves the caller's list alone", () => {
    const result = filterVouchers(list, "all", "", NOW);
    expect(result).not.toBe(list);
    expect(result).toEqual(list);
  });
});

describe("describing the deal", () => {
  it("names a capped percentage", () => {
    expect(describeDiscount(voucher({ discountValue: 20, maxDiscountAmount: 100 }))).toBe(
      "20% off, up to ₱100",
    );
  });

  it("names a peso amount and free delivery", () => {
    expect(describeDiscount(voucher({ discountType: "fixed", discountValue: 50 }))).toBe("₱50 off");
    expect(describeDiscount(voucher({ discountType: "free_delivery", discountValue: 0 }))).toBe(
      "Free delivery",
    );
  });

  it("keeps centavos only when there are some", () => {
    expect(describeDiscount(voucher({ discountType: "fixed", discountValue: 12.5 }))).toBe(
      "₱12.50 off",
    );
  });

  it("gives the ticket stub a big value and a small unit", () => {
    expect(discountHeadline(voucher({ discountValue: 15 }))).toEqual({ value: "15%", unit: "OFF" });
    expect(discountHeadline(voucher({ discountType: "fixed", discountValue: 100 }))).toEqual({
      value: "₱100",
      unit: "OFF",
    });
    expect(discountHeadline(voucher({ discountType: "free_delivery" }))).toEqual({
      value: "FREE",
      unit: "DELIVERY",
    });
  });

  it("shows a blank value while the merchant has not typed one", () => {
    expect(discountHeadline(voucher({ discountValue: 0 }))).toEqual({ value: "–%", unit: "OFF" });
  });

  it("counts the products or categories a scoped code touches", () => {
    expect(describeScope(voucher())).toBe("Whole order");
    expect(describeScope(voucher({ scope: "products", targetIds: ["a"] }))).toBe("1 product");
    expect(describeScope(voucher({ scope: "categories", targetIds: ["a", "b"] }))).toBe(
      "2 categories",
    );
  });

  it("lists only the rules that restrict anything", () => {
    expect(describeRules(voucher())).toEqual([]);
    expect(
      describeRules(voucher({ minOrderAmount: 300, usageLimitPerCustomer: 1, isStackable: true })),
    ).toEqual(["Min. order ₱300", "1 use per customer", "Combines with other codes"]);
  });
});

describe("describeWindow", () => {
  it("says nothing for a code with no dates", () => {
    expect(describeWindow(voucher(), NOW)).toBeNull();
  });

  it("counts down the last few days", () => {
    const endsIn3 = voucher({ endsAt: new Date(2026, 8, 29, 23, 59).toISOString() });
    expect(describeWindow(endsIn3, NOW)).toBe("Ends in 3 days");
    const endsToday = voucher({ endsAt: new Date(2026, 8, 26, 23, 59).toISOString() });
    expect(describeWindow(endsToday, NOW)).toBe("Ends today");
  });

  it("names the date when the end is further off, or already past", () => {
    const far = voucher({ endsAt: new Date(2026, 10, 30, 23, 59).toISOString() });
    expect(describeWindow(far, NOW)).toBe("Until Nov 30");
    const past = voucher({ endsAt: new Date(2026, 8, 20, 23, 59).toISOString() });
    expect(describeWindow(past, NOW)).toBe("Ended Sep 20");
  });

  it("names the start of a scheduled code", () => {
    const later = voucher({ startsAt: new Date(2026, 9, 1).toISOString() });
    expect(describeWindow(later, NOW)).toBe("Starts Oct 1");
  });
});

describe("usageProgress", () => {
  it("has no ratio for an unlimited code", () => {
    expect(usageProgress(voucher({ usedCount: 7 }))).toEqual({
      used: 7,
      limit: null,
      remaining: null,
      ratio: null,
    });
  });

  it("clamps an over-spent code at full", () => {
    expect(usageProgress(voucher({ usedCount: 12, usageLimitTotal: 10 }))).toEqual({
      used: 12,
      limit: 10,
      remaining: 0,
      ratio: 1,
    });
  });
});

describe("voucherShareMessage", () => {
  it("writes a post a merchant can paste straight into Facebook", () => {
    const message = voucherShareMessage(
      voucher({ discountValue: 20, minOrderAmount: 300, endsAt: new Date(2026, 9, 5, 23, 59).toISOString() }),
      "Kape Tayo",
      NOW,
    );
    expect(message).toBe(
      "Use code SAVE10 for 20% off at Kape Tayo! Min. order ₱300. Until Oct 5.",
    );
  });

  it("leaves out the store when its name is unknown", () => {
    expect(voucherShareMessage(voucher(), null, NOW)).toBe("Use code SAVE10 for 10% off!");
  });
});
