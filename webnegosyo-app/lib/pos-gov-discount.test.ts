import { defaultTaxProfile, type GovClaimantInput } from "./gov-discount";
import type { PosCartLine } from "./pos-cart";
import {
  EMPTY_POS_DISCOUNT_SESSION,
  discountAfterCartChange,
  sessionDiscount,
  setSessionGovernment,
} from "./pos-discount-session";
import {
  EMPTY_GOV_SESSION,
  allocationsByOrderLine,
  allowsSharedTable,
  govApprovalPending,
  govSessionAfterCartChange,
  govSessionFromStored,
  priceGovSession,
  storedGovDiscount,
  withApproval,
  withClaimant,
  withDiners,
  withOfflineSkip,
  withoutClaimant,
  type PosGovContext,
} from "./pos-gov-discount";
import type { Voucher } from "./vouchers/types";

const line = (key: string, subtotal: number, quantity = 1, menuItemId = key): PosCartLine =>
  ({
    key,
    menuItemId,
    name: key,
    basePrice: subtotal / quantity,
    quantity,
    subtotal,
    unitPrice: subtotal / quantity,
    selections: [],
  }) as PosCartLine;

const senior = (overrides: Partial<GovClaimantInput> = {}): GovClaimantInput => ({
  id: "c1",
  kind: "senior",
  name: "Juan Dela Cruz",
  idNumber: "12345",
  allocation: { mode: "items", units: { sisig: 1 } },
  ...overrides,
});

const VAT_CONTEXT: PosGovContext = {
  profile: defaultTaxProfile("vat"),
  excludedMenuItemIds: new Set(),
  allowShared: true,
};

describe("priceGovSession", () => {
  it("prices a senior's own dish and names both parts of the reduction", () => {
    const state = priceGovSession({
      session: withClaimant(EMPTY_GOV_SESSION, senior()),
      cart: [line("sisig", 560)],
      context: VAT_CONTEXT,
      serviceCharge: 0,
      deliveryFee: 0,
    });

    expect(state.status).toBe("priced");
    if (state.status !== "priced") return;
    expect(state.pricing.result.totalReduction).toBe(160);
    expect(state.pricing.lines.map((row) => row.amount)).toEqual([60, 100]);
  });

  it("asks for setup when the store has no tax profile yet", () => {
    const state = priceGovSession({
      session: withClaimant(EMPTY_GOV_SESSION, senior()),
      cart: [line("sisig", 560)],
      context: { ...VAT_CONTEXT, profile: null },
      serviceCharge: 0,
      deliveryFee: 0,
    });

    expect(state.status).toBe("setup_needed");
  });

  it("explains what to fix instead of pricing a bad claim", () => {
    const state = priceGovSession({
      session: withClaimant(EMPTY_GOV_SESSION, senior({ idNumber: "" })),
      cart: [line("sisig", 560)],
      context: VAT_CONTEXT,
      serviceCharge: 0,
      deliveryFee: 0,
    });

    expect(state.status).toBe("needs_attention");
  });

  it("does not cover an item the owner excluded", () => {
    const shared = withDiners(withClaimant(EMPTY_GOV_SESSION, senior({ allocation: { mode: "shared" } })), 2);
    const priced = priceGovSession({
      session: shared,
      cart: [line("sisig", 400), line("mug", 600)],
      context: { ...VAT_CONTEXT, profile: defaultTaxProfile("non_vat"), excludedMenuItemIds: new Set(["mug"]) },
      serviceCharge: 0,
      deliveryFee: 0,
    });

    // ₱400 of food split two ways; the ₱600 mug is never shared.
    expect(priced.status === "priced" && priced.pricing.result.claimants[0].grossShare).toBe(200);
  });
});

describe("the higher discount wins, never both", () => {
  const voucher = (value: number): Voucher => ({
    id: "v1",
    code: "PROMO",
    name: "Promo",
    discountType: "fixed",
    discountValue: value,
    scope: "universal",
    targetIds: [],
    isStackable: true,
    usedCount: 0,
    channels: ["pos"],
    isActive: true,
  });

  function sale(voucherValue: number) {
    const session = setSessionGovernment(
      { ...EMPTY_POS_DISCOUNT_SESSION, vouchers: [voucher(voucherValue)] },
      withClaimant(EMPTY_GOV_SESSION, senior()),
    );
    return sessionDiscount(session, [line("sisig", 560)], 0, new Date(), null, 0, VAT_CONTEXT);
  }

  it("applies the Senior discount when it saves more", () => {
    const result = sale(50);

    expect(result.total).toBe(160);
    expect(result.regime).toEqual({ regime: "government", advantage: 110 });
  });

  it("keeps the promo when it saves more, and says so", () => {
    const result = sale(300);

    expect(result.total).toBe(300);
    expect(result.regime?.regime).toBe("other");
    expect(result.government.status).toBe("priced");
  });

  it("ignores government claimants when the register passes no context", () => {
    const session = setSessionGovernment(EMPTY_POS_DISCOUNT_SESSION, withClaimant(EMPTY_GOV_SESSION, senior()));
    expect(sessionDiscount(session, [line("sisig", 560)], 0, new Date()).total).toBe(0);
  });
});

describe("the session follows the cart", () => {
  it("drops units on a voided line and caps the rest", () => {
    const session = withClaimant(EMPTY_GOV_SESSION, senior({ allocation: { mode: "items", units: { sisig: 2, rice: 1 } } }));

    const next = govSessionAfterCartChange(session, [line("sisig", 560, 1)]);

    expect(next.claimants[0].allocation).toEqual({ mode: "items", units: { sisig: 1 } });
  });

  it("returns the same object when nothing moved, and nothing at all on an empty cart", () => {
    const session = withClaimant(EMPTY_GOV_SESSION, senior());
    expect(govSessionAfterCartChange(session, [line("sisig", 560)])).toBe(session);
    expect(govSessionAfterCartChange(session, [])).toBe(EMPTY_GOV_SESSION);
  });

  it("clears the claimants with the sale", () => {
    const session = setSessionGovernment(EMPTY_POS_DISCOUNT_SESSION, withClaimant(EMPTY_GOV_SESSION, senior()));
    expect(discountAfterCartChange(session, [])).toBe(EMPTY_POS_DISCOUNT_SESSION);
  });

  it("voids an approval whenever who-claims-what changes", () => {
    const approved = withApproval(withClaimant(EMPTY_GOV_SESSION, senior()), {
      approvalId: "a1",
      approverName: "Mara",
      approvedReduction: 160,
    });

    expect(withDiners(approved, 3).approval).toBeNull();
    expect(withClaimant(approved, senior({ id: "c2", idNumber: "999" })).approval).toBeNull();
    expect(withoutClaimant(approved, "c1")).toBe(EMPTY_GOV_SESSION);
  });
});

describe("manager approval", () => {
  const strict = { ...defaultTaxProfile("vat"), approvalRule: "above" as const, approvalThreshold: 100 };

  it("is pending above the threshold until a manager approves enough", () => {
    const session = withClaimant(EMPTY_GOV_SESSION, senior());
    const approved = withApproval(session, { approvalId: "a1", approverName: "Mara", approvedReduction: 160 });

    expect(govApprovalPending(session, strict, 160)).toBe(true);
    expect(govApprovalPending(approved, strict, 160)).toBe(false);
    expect(govApprovalPending(approved, strict, 200)).toBe(true);
    expect(govApprovalPending(session, strict, 80)).toBe(false);
  });

  it("lets an offline sale through, to be flagged later", () => {
    expect(govApprovalPending(withOfflineSkip(withClaimant(EMPTY_GOV_SESSION, senior())), strict, 160)).toBe(false);
  });
});

describe("storing and re-reading the discount", () => {
  it("stores the VAT block and rebuilds the same session for an edit", () => {
    const session = withApproval(withClaimant(EMPTY_GOV_SESSION, senior()), {
      approvalId: "a1",
      approverName: "Mara",
      approvedReduction: 160,
    });
    const state = priceGovSession({ session, cart: [line("sisig", 560)], context: VAT_CONTEXT, serviceCharge: 0, deliveryFee: 0 });
    if (state.status !== "priced") throw new Error("expected priced");

    const stored = storedGovDiscount({
      session,
      pricing: state.pricing,
      profile: defaultTaxProfile("vat"),
      itemsTotal: 560,
      serviceCharge: 0,
      deliveryFee: 0,
    });

    expect(stored.vat).toEqual({ vatableSales: 0, vatAmount: 0, vatExemptSales: 500, zeroRatedSales: 0, lessDiscounts: 100 });
    expect(govSessionFromStored(stored)).toEqual({
      claimants: [senior()],
      diners: null,
      approval: { approvalId: "a1", approverName: "Mara", approvedReduction: 160 },
      approvalSkippedOffline: false,
    });
  });

  it("maps per-cart-key reductions onto the order's line indexes", () => {
    expect(allocationsByOrderLine([line("rice", 50), line("sisig", 560)], { sisig: 160 })).toEqual({ "line-1": 160 });
  });
});

describe("allowsSharedTable", () => {
  it("only splits a table for dine-in, and only if the owner allows it", () => {
    expect(allowsSharedTable(defaultTaxProfile("vat"), "dine_in")).toBe(true);
    expect(allowsSharedTable(defaultTaxProfile("vat"), "pickup")).toBe(false);
    expect(allowsSharedTable(defaultTaxProfile("vat"), "delivery")).toBe(false);
    expect(allowsSharedTable({ ...defaultTaxProfile("vat"), allowSharedTable: false }, "dine_in")).toBe(false);
  });
});
