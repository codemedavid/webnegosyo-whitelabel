/**
 * Editing an order that carries a Senior/PWD discount: the discount is
 * re-priced against the edited cart, never carried as a fixed amount and
 * never taken off twice.
 */
import { computeGovDiscount, defaultTaxProfile, type StoredGovDiscount } from "./gov-discount";
import { editModeTotals, enterEditMode } from "./pos-edit-mode";
import { lineKey, type PosCartLine } from "./pos-cart";
import {
  fromOrderLineKeys,
  govSessionAfterCartChange,
  govSessionFromStored,
  priceGovSession,
  storedGovDiscount,
  type PosGovContext,
} from "./pos-gov-discount";

const EMPTY_CATALOG = { items: {}, modifiers: {} } as never;
const SISIG_KEY = lineKey("m-sisig", [], undefined, undefined);

const CONTEXT: PosGovContext = {
  profile: defaultTaxProfile("vat"),
  excludedMenuItemIds: new Set(),
  allowShared: true,
};

function placedGovernment(): StoredGovDiscount {
  const priced = computeGovDiscount({
    vatStatus: "vat",
    // Stored by position, as the register writes it (`toOrderLineKeys`).
    lines: [{ key: "line-0", name: "Sisig", quantity: 1, amount: 560, eligible: true }],
    claimants: [
      { id: "c1", kind: "senior", name: "Juan Dela Cruz", idNumber: "12345", allocation: { mode: "items", units: { "line-0": 1 } } },
    ],
  });
  if (!priced.ok) throw new Error("fixture must price");
  return { version: 1, vatStatus: "vat", serviceChargeMode: "full", diners: null, claimants: priced.claimants, vat: null };
}

function placedOrder() {
  return {
    _id: "order-g",
    total: 400,
    revisionNumber: 0,
    items: [{ menuItemId: "m-sisig", menuItemName: "Sisig", quantity: 1, subtotal: 560 }],
    customerData: {
      discount: {
        total: 160,
        deliveryDiscount: 0,
        lines: [
          { label: "SC VAT exemption · J. Dela Cruz", amount: 60, isGovernment: true },
          { label: "SC 20% · J. Dela Cruz", amount: 100, isGovernment: true },
        ],
        allocationsByLine: { "line-0": 160 },
        government: placedGovernment(),
      },
    },
  };
}

const line = (menuItemId: string, subtotal: number): PosCartLine =>
  ({
    key: lineKey(menuItemId, [], undefined, undefined),
    menuItemId,
    name: menuItemId,
    basePrice: subtotal,
    quantity: 1,
    subtotal,
    unitPrice: subtotal,
    selections: [],
  }) as PosCartLine;

/** The store's `beginEdit`: stored positions → the hydrated cart's keys. */
function placedSession() {
  const entered = enterEditMode(placedOrder(), [], EMPTY_CATALOG);
  const stored = entered.context.storedDiscount?.government;
  return { entered, session: govSessionFromStored(stored ? fromOrderLineKeys(stored, entered.cart) : null) };
}

function reprice(cart: PosCartLine[]) {
  const { entered, session: placed } = placedSession();
  const context = entered.context;
  const session = govSessionAfterCartChange(placed, cart);
  const state = priceGovSession({ session, cart, context: CONTEXT, serviceCharge: 0, deliveryFee: 0 });
  const lines = state.status === "priced" ? state.pricing.lines : [];
  const record =
    state.status === "priced"
      ? storedGovDiscount({ session, pricing: state.pricing, profile: CONTEXT.profile!, itemsTotal: 0, serviceCharge: 0, deliveryFee: 0 })
      : null;
  return editModeTotals(cart, context, lines, record);
}

describe("editing an order with a Senior/PWD discount", () => {
  it("re-creates the placed claimants as live inputs", () => {
    const { entered, session } = placedSession();
    const context = entered.context;

    expect(session.claimants.map((claimant) => claimant.name)).toEqual(["Juan Dela Cruz"]);
    expect(session.claimants[0].allocation).toEqual({ mode: "items", units: { [entered.cart[0].key]: 1 } });
    // The placed discount came out of the carried residue, so nothing is left over.
    expect(context.carriedCharges).toBe(0);
  });

  it("bills the discount once when nothing changed", () => {
    expect(reprice([line("m-sisig", 560)]).newTotal).toBe(400);
  });

  it("charges full price for a dish added to the table", () => {
    expect(reprice([line("m-sisig", 560), line("m-rice", 100)]).newTotal).toBe(500);
  });

  it("drops the discount with the senior's dish", () => {
    const totals = reprice([line("m-rice", 100)]);

    expect(totals.newTotal).toBe(100);
    expect(totals.settledDiscount).toBeNull();
  });

  it("stores the re-priced government block on the revision", () => {
    const totals = reprice([line("m-sisig", 560), line("m-rice", 100)]);

    expect(totals.settledDiscount?.government?.claimants[0].reduction).toBe(160);
    expect(totals.settledDiscount?.total).toBe(160);
  });
});
