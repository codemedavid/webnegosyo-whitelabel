/**
 * The register side of the two cases the client asked about:
 * A. one of five fries is the senior's — the cashier steps "Their items" to 1;
 * B. one senior at a shared table of four.
 * Driven through the same pure helpers the Senior/PWD sheet uses.
 */
import { defaultTaxProfile } from "./gov-discount";
import type { PosCartLine } from "./pos-cart";
import { EMPTY_GOV_SESSION, allowsSharedTable, priceGovSession, withClaimant, withDiners, type PosGovContext } from "./pos-gov-discount";
import { claimantFromDraft, newClaimantDraft, withUnits } from "./pos-gov-draft";
import { billUnits } from "./bill/bill-split";
import { billOrder } from "./bill/bill-fixtures";

const line = (key: string, subtotal: number, quantity = 1): PosCartLine =>
  ({
    key,
    menuItemId: key,
    name: key,
    basePrice: subtotal / quantity,
    quantity,
    subtotal,
    unitPrice: subtotal / quantity,
    selections: [],
  }) as PosCartLine;

const VAT_CONTEXT: PosGovContext = {
  profile: defaultTaxProfile("vat"),
  excludedMenuItemIds: new Set(),
  allowShared: true,
};

const NONE: ReadonlySet<string> = new Set();

function identified(share: "whole" | "items" | "shared") {
  return { ...newClaimantDraft("c1", "senior"), name: "Juan Dela Cruz", idNumber: "12345", share };
}

describe("A. the cashier marks 1 of 5 fries as the senior's", () => {
  const cart = [line("fries", 560, 5), line("burger", 300, 1)];

  it("the stepper builds a 1-unit claim and the sale prices ₱32 off", () => {
    const draft = withUnits(identified("items"), "fries", 1);
    const claimant = claimantFromDraft(draft, cart, EMPTY_GOV_SESSION, NONE);
    expect(claimant.allocation).toEqual({ mode: "items", units: { fries: 1 } });

    const state = priceGovSession({
      session: withClaimant(EMPTY_GOV_SESSION, claimant),
      cart,
      context: VAT_CONTEXT,
      serviceCharge: 0,
      deliveryFee: 0,
    });
    expect(state.status).toBe("priced");
    if (state.status !== "priced") return;
    expect(state.pricing.result.totalReduction).toBe(32);
    expect(state.pricing.result.lineReductions).toEqual({ fries: 32 });
  });

  it('"Just them" (eating alone) takes every unit — that is the other choice', () => {
    const claimant = claimantFromDraft(identified("whole"), cart, EMPTY_GOV_SESSION, NONE);
    expect(claimant.allocation).toEqual({ mode: "items", units: { fries: 5, burger: 1 } });
  });
});

describe("B. one senior at a shared table of four", () => {
  it("prices ₱142.86 off a ₱2,000 VAT bill (table pays ₱1,857.14)", () => {
    const cart = [line("platter", 2000, 1)];
    const claimant = claimantFromDraft(identified("shared"), cart, EMPTY_GOV_SESSION, NONE);
    const session = withDiners(withClaimant(EMPTY_GOV_SESSION, claimant), 4);

    const state = priceGovSession({ session, cart, context: VAT_CONTEXT, serviceCharge: 0, deliveryFee: 0 });
    expect(state.status).toBe("priced");
    if (state.status !== "priced") return;
    expect(state.pricing.result.claimants[0].netDue).toBe(357.14);
    expect(2000 - state.pricing.result.totalReduction).toBeCloseTo(1857.14, 2);
  });

  it("offers the shared table only for dine-in", () => {
    const profile = defaultTaxProfile("vat");
    expect(allowsSharedTable(profile, "dine_in")).toBe(true);
    expect(allowsSharedTable(profile, "takeout")).toBe(false);
    expect(allowsSharedTable(profile, "delivery")).toBe(false);
  });
});

describe("split by item, 1 of 5 fries claimed", () => {
  // ₱560 of fries (5 × ₱112) at a VAT store, the senior's one fries = ₱32 off.
  const order = billOrder({
    _id: "f",
    total: 528,
    customerData: {
      discount: {
        total: 32,
        deliveryDiscount: 0,
        lines: [
          { label: "SC VAT exemption · J. Dela Cruz", amount: 12 },
          { label: "SC 20% · J. Dela Cruz", amount: 20 },
        ],
        allocationsByLine: { "line-0": 32 },
        government: {
          version: 1,
          vatStatus: "vat",
          serviceChargeMode: "full",
          diners: null,
          vat: null,
          claimants: [
            {
              id: "c1",
              kind: "senior",
              name: "Juan Dela Cruz",
              idNumber: "12345",
              allocation: { mode: "items", units: { "line-0": 1 } },
              grossShare: 112,
              vatExemptSales: 100,
              vatRemoved: 12,
              discount: 20,
              netDue: 80,
              serviceChargeShare: 0,
              serviceChargeVatRemoved: 0,
              reduction: 32,
              lineReductions: { "line-0": 32 },
            },
          ],
        },
      },
    },
    items: [{ orderId: "f", menuItemName: "Fries", quantity: 5, subtotal: 560 }],
  });

  it("the five pieces still add up to the order total", () => {
    const units = billUnits([order]);
    expect(units).toHaveLength(5);
    expect(units.reduce((sum, unit) => sum + unit.totalCents, 0)).toBe(52800);
  });

  // The ₱32 is the senior's ONE fries, so it rides on one piece — whoever
  // takes that fries pays ₱80; the other four stay at ₱112.
  it("puts the whole ₱32 on ONE fries piece (the senior's)", () => {
    const units = billUnits([order]);
    const discounted = units.filter((unit) => unit.discountLines.length > 0);
    expect(discounted).toHaveLength(1);
    expect(discounted[0].totalCents).toBe(8000);
  });
});
