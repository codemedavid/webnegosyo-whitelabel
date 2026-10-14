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
  toOrderLineKeys,
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
  return { entered, session: govSessionFromStored(stored ? fromOrderLineKeys(stored, entered.context.orderLineCartKeys) : null) };
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

  it("keeps each line's share of the discount on the revision", () => {
    // The store hands the record over by order position (`toOrderLineKeys`);
    // the revision must keep that per-line split, or the edited order's
    // order_items.discount_amount reads 0 and a split bill spreads the
    // senior's discount over the whole table.
    const cart = [line("m-sisig", 560), line("m-rice", 100)];
    const { entered, session: placed } = placedSession();
    const session = govSessionAfterCartChange(placed, cart);
    const state = priceGovSession({ session, cart, context: CONTEXT, serviceCharge: 0, deliveryFee: 0 });
    if (state.status !== "priced") throw new Error("expected a priced session");
    const record = storedGovDiscount({ session, pricing: state.pricing, profile: CONTEXT.profile!, itemsTotal: 0, serviceCharge: 0, deliveryFee: 0 });

    const totals = editModeTotals(cart, entered.context, state.pricing.lines, toOrderLineKeys(record, cart));

    expect(totals.settledDiscount?.allocationsByLine).toEqual({ "line-0": 160 });
  });
});

describe("loading a Senior/PWD order whose lines do not map one-to-one onto the cart", () => {
  // Line 0 is empty (skipped on load); lines 1 and 2 are the same dish, which
  // loading merges into ONE cart line of two.
  const items = [
    { menuItemId: "m-rice", menuItemName: "Rice", quantity: 0, subtotal: 0 },
    { menuItemId: "m-sisig", menuItemName: "Sisig", quantity: 1, subtotal: 560 },
    { menuItemId: "m-sisig", menuItemName: "Sisig", quantity: 1, subtotal: 560 },
  ];

  function storedClaiming(units: Record<string, number>): StoredGovDiscount {
    const priced = computeGovDiscount({
      vatStatus: "vat",
      lines: [
        { key: "line-1", name: "Sisig", quantity: 1, amount: 560, eligible: true },
        { key: "line-2", name: "Sisig", quantity: 1, amount: 560, eligible: true },
      ],
      claimants: [{ id: "c1", kind: "senior", name: "Juan Dela Cruz", idNumber: "12345", allocation: { mode: "items", units } }],
    });
    if (!priced.ok) throw new Error("fixture must price");
    return { version: 1, vatStatus: "vat", serviceChargeMode: "full", diners: null, claimants: priced.claimants, vat: null };
  }

  function openWith(stored: StoredGovDiscount) {
    const order = {
      _id: "order-m",
      total: 1120 - stored.claimants[0].reduction,
      revisionNumber: 0,
      items,
      customerData: { discount: { total: stored.claimants[0].reduction, deliveryDiscount: 0, lines: [], allocationsByLine: {}, government: stored } },
    };
    return enterEditMode(order as never, [], EMPTY_CATALOG);
  }

  it("finds the claimed dish by identity, not by cart position", () => {
    const entered = openWith(storedClaiming({ "line-2": 1 }));
    const session = govSessionFromStored(fromOrderLineKeys(entered.context.storedDiscount!.government!, entered.context.orderLineCartKeys));

    expect(entered.cart).toHaveLength(1);
    expect(session.claimants[0].allocation).toEqual({ mode: "items", units: { [SISIG_KEY]: 1 } });
  });

  it("adds up claims on two order lines that loaded as one cart line", () => {
    const entered = openWith(storedClaiming({ "line-1": 1, "line-2": 1 }));
    const session = govSessionFromStored(fromOrderLineKeys(entered.context.storedDiscount!.government!, entered.context.orderLineCartKeys));

    expect(session.claimants[0].allocation).toEqual({ mode: "items", units: { [SISIG_KEY]: 2 } });
  });

  it("saves the claim under the dish's position on the revised order", () => {
    const entered = openWith(storedClaiming({ "line-2": 1 }));
    const loaded = fromOrderLineKeys(entered.context.storedDiscount!.government!, entered.context.orderLineCartKeys);

    // The revision writes one order line per cart line, in cart order.
    expect(toOrderLineKeys(loaded, entered.cart).claimants[0].allocation).toEqual({ mode: "items", units: { "line-0": 1 } });
  });
});
