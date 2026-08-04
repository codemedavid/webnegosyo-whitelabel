/**
 * The voucher journey, driven through the REAL register store.
 *
 * Four money defects reached `main` here and were caught only by a manual
 * audit, because `jest.config.js` scoped the suite to `lib/` — nothing in
 * either repo could so much as import `stores/pos-cart-store.ts`. The pure
 * modules underneath were all well covered; the wiring between them was not,
 * and the wiring is where the money leaked.
 *
 * So these tests deliberately mock NOTHING that prices a sale. The cart engine,
 * the voucher engine, the discount session, the edit re-pricer, the order
 * builder and the cash drawer are all the shipping code. Even the auth store is
 * real — it is plain Zustand with no native dependency, and a stub of it would
 * be one more thing that can agree with a test while disagreeing with the app.
 *
 * Every assertion is on MONEY. A voucher journey that reaches the right state
 * shape and the wrong peso figure is the exact failure that shipped.
 */

import { computeChange } from "../lib/pos-cash";
import { cartTotals, revisedOrderTotal, type PosCartLine } from "../lib/pos-cart";
import { posDiscountContext } from "../lib/pos-discount";
import { enterEditMode, editModeTotals, withEditVouchers } from "../lib/pos-edit-mode";
import { buildPosOrder } from "../lib/pos-order";
import { applyVouchers } from "../lib/vouchers/stacking";
import type { Voucher } from "../lib/vouchers/types";
import { useAuthStore } from "./auth-store";
import { usePosCartStore } from "./pos-cart-store";

const LATTE = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 150,
  quantity: 2,
  selections: [],
};

const CAKE = {
  menuItemId: "m-cake",
  name: "Cake",
  basePrice: 200,
  quantity: 1,
  selections: [],
};

/** 10% service charge on the chosen order type. */
const SERVICE_CHARGE = { type: "percentage", value: 10 } as const;

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

const SAVE20 = voucher({});

/** 20% off lattes only. */
const LATTE20 = voucher({
  id: "v-latte20",
  code: "LATTE20",
  name: "20% off lattes",
  scope: "products",
  targetIds: ["m-latte"],
});

const FREE_DELIVERY = voucher({
  id: "v-freedel",
  code: "FREEDEL",
  name: "Free delivery",
  discountType: "free_delivery",
  discountValue: 0,
});

/** Category scope — the register holds no category on a cart line. */
const PASTA20 = voucher({
  id: "v-pasta",
  code: "PASTA20",
  name: "20% off pasta",
  scope: "categories",
  targetIds: ["cat-pasta"],
});

const store = () => usePosCartStore.getState();

/** The register as it opens: empty cart, no discount, no guest. */
function openRegister(serviceCharge?: typeof SERVICE_CHARGE): void {
  usePosCartStore.setState({
    lines: [],
    editContext: null,
    editWarnings: [],
    orderTypeId: null,
    orderTypeName: null,
    serviceCharge,
    customerName: "",
    attachedCustomer: null,
    discount: { vouchers: [], manual: null },
  });
}

beforeEach(() => {
  openRegister();
  useAuthStore.setState({ outletId: null });
});

/** What the shared voucher engine says this cart's discount is worth. */
function engineDiscountTotal(vouchers: Voucher[], lines: PosCartLine[], charge: number) {
  return applyVouchers(vouchers, posDiscountContext(lines, charge, new Date(), null))
    .discountTotal;
}

describe("journey 1 — ringing up a discounted counter sale", () => {
  beforeEach(() => {
    openRegister(SERVICE_CHARGE);
    store().add(LATTE);
    store().add(CAKE);
    store().applyVoucher(SAVE20);
  });

  it("bills the sale net of the discount the engine priced", () => {
    // ₱300 of lattes + ₱200 of cake, 10% service charge = ₱550 gross.
    const totals = store().totals();
    expect(totals.subtotal).toBe(500);
    expect(totals.serviceCharge).toBe(50);

    // 20% of the ₱500 of merchandise. Not of the service charge — the engine
    // discounts lines, and the charge only widens the cap.
    expect(store().sessionDiscount().total).toBe(100);
    expect(totals.discountTotal).toBe(100);
    expect(totals.total).toBe(450);
  });

  it("takes off exactly what the shared engine says, not a register-local figure", () => {
    const fromEngine = engineDiscountTotal([SAVE20], store().lines, store().totals().serviceCharge);

    expect(store().sessionDiscount().total).toBe(fromEngine);
    expect(store().totals().discountTotal).toBe(fromEngine);
  });

  it("writes a NET order with the discount breakdown attached", () => {
    const order = buildPosOrder({
      cart: store().lines,
      serviceCharge: SERVICE_CHARGE,
      discounts: store().sessionDiscount().lines,
      tender: { methodName: "Cash", isCash: true, cashTendered: 500, changeDue: 50 },
      clientOrderId: "sale-1",
    });

    // The customer is charged ₱450, not the ₱550 the cart is worth.
    expect(order.total).toBe(450);
    expect(order.total).toBe(store().totals().total);

    const discount = (order.customerData as { discount?: { total: number; lines: unknown[] } })
      .discount;
    expect(discount?.total).toBe(100);
    expect(discount?.lines).toEqual([
      { label: "20% off", amount: 100, voucherId: "v-save20", code: "SAVE20" },
    ]);
    // The payment blob must survive alongside it — both settle the sale.
    expect(order.customerData.pos).toEqual({ cashTendered: 500, changeDue: 50 });
  });

  it("accepts cash that covers the DISCOUNTED total but not the gross", () => {
    const net = store().totals().total;
    expect(net).toBe(450);

    // ₱500 is short of the ₱550 gross and would have been refused by a tender
    // check written against the undiscounted cart.
    const tendered = 500;
    expect(computeChange(net, tendered)).toEqual({ changeDue: 50, isSufficient: true });

    const order = buildPosOrder({
      cart: store().lines,
      serviceCharge: SERVICE_CHARGE,
      discounts: store().sessionDiscount().lines,
      tender: { methodName: "Cash", isCash: true, cashTendered: tendered, changeDue: 50 },
      clientOrderId: "sale-2",
    });
    expect(order.total).toBe(450);
  });

  it("still refuses cash that is short of the discounted total", () => {
    expect(() =>
      buildPosOrder({
        cart: store().lines,
        serviceCharge: SERVICE_CHARGE,
        discounts: store().sessionDiscount().lines,
        tender: { methodName: "Cash", isCash: true, cashTendered: 449, changeDue: 0 },
        clientOrderId: "sale-3",
      }),
    ).toThrow("Insufficient cash tendered");
  });
});

/**
 * The regression that re-billed customers.
 *
 * A placed order carries a discount whose conditions were evaluated against a
 * cart that no longer exists. Opening it in the register re-prices it against
 * the register's view — which has no delivery fee and no category on a line —
 * and both of those absences look exactly like "this voucher no longer fits".
 * Dropping the line on that reading charges the customer their discount back.
 */
describe("journey 2 — editing a placed order that carried a voucher", () => {
  const placedOrder = (args: {
    total: number;
    deliveryFee: number;
    items: { menuItemId: string; menuItemName: string; quantity: number; subtotal: number }[];
    voucher: Voucher;
    discountTotal: number;
    deliveryDiscount: number;
  }) => ({
    _id: "order-1",
    total: args.total,
    revisionNumber: 1,
    deliveryFee: args.deliveryFee,
    items: args.items,
    customerData: {
      discount: {
        total: args.discountTotal,
        deliveryDiscount: args.deliveryDiscount,
        lines: [
          {
            label: args.voucher.name,
            amount: args.discountTotal,
            voucherId: args.voucher.id,
            code: args.voucher.code,
          },
        ],
        allocationsByLine: {},
      },
    },
  });

  const EMPTY_CATALOG = {} as never;

  /** ₱800 of food + ₱100 delivery, delivery given free = ₱800 charged. */
  const deliveryOrder = placedOrder({
    total: 800,
    deliveryFee: 100,
    items: [{ menuItemId: "m-pasta", menuItemName: "Pasta", quantity: 1, subtotal: 800 }],
    voucher: FREE_DELIVERY,
    discountTotal: 100,
    deliveryDiscount: 100,
  });

  /** ₱500 of pasta, 20% off the pasta CATEGORY = ₱400 charged. */
  const categoryOrder = placedOrder({
    total: 400,
    deliveryFee: 0,
    items: [{ menuItemId: "m-carbonara", menuItemName: "Carbonara", quantity: 1, subtotal: 500 }],
    voucher: PASTA20,
    discountTotal: 100,
    deliveryDiscount: 0,
  });

  function openForEdit(order: ReturnType<typeof placedOrder>, vouchers: Voucher[] | null) {
    openRegister();
    store().beginEdit(enterEditMode(order, [], EMPTY_CATALOG));
    store().setEditVouchers(vouchers);
    return store().editContext!;
  }

  it("keeps a free-delivery discount alive on the re-price", () => {
    const context = openForEdit(deliveryOrder, [FREE_DELIVERY]);
    const totals = editModeTotals(store().lines, context);

    expect(totals.itemsTotal).toBe(800);
    // ₱900 is the bill with the free delivery revoked. That is the re-bill.
    expect(totals.newTotal).not.toBe(900);
    expect(totals.newTotal).toBe(800);
  });

  it("keeps a category-scoped discount alive even though a register line has no category", () => {
    const context = openForEdit(categoryOrder, [PASTA20]);
    const totals = editModeTotals(store().lines, context);

    expect(totals.itemsTotal).toBe(500);
    // ₱500 is full price — the discount silently revoked.
    expect(totals.newTotal).not.toBe(500);
    expect(totals.newTotal).toBe(400);
  });

  it("carries the discount through a real edit rather than only an untouched one", () => {
    const context = openForEdit(deliveryOrder, [FREE_DELIVERY]);
    store().add({ ...LATTE, quantity: 1 }); // + ₱150

    const totals = editModeTotals(store().lines, context);
    expect(totals.itemsTotal).toBe(950);
    expect(totals.isDirty).toBe(true);
    expect(totals.canSave).toBe(true);
    // 950 items + 100 delivery − 100 free delivery.
    expect(totals.newTotal).toBe(950);
  });

  it("saves the figure the cashier was shown — carriedChargesForSave reproduces newTotal", () => {
    for (const [order, vouchers] of [
      [deliveryOrder, [FREE_DELIVERY]],
      [categoryOrder, [PASTA20]],
    ] as const) {
      const context = openForEdit(order, [...vouchers]);
      const totals = editModeTotals(store().lines, context);

      // This is the identity that stops the register showing one bill and
      // writing another: the revise mutation recomputes the total from items,
      // delivery and the carried residue, and it must land on what was shown.
      expect(
        revisedOrderTotal(totals.itemsTotal, context.deliveryFee, totals.carriedChargesForSave),
      ).toBe(totals.newTotal);
    }
  });

  it("carries the bill as placed when the voucher lookup never returns", () => {
    // A counter with no signal. Charging more because the wifi dropped is the
    // worse failure, so the placed discount rides along untouched.
    const context = openForEdit(deliveryOrder, null);
    const totals = editModeTotals(store().lines, context);

    expect(totals.newTotal).toBe(800);
  });
});

describe("journey 3 — the discount must not leak onto the next customer", () => {
  it("drops the discount when the cart is emptied with the − stepper", () => {
    openRegister(SERVICE_CHARGE);
    store().add(LATTE);
    store().applyVoucher(SAVE20);
    expect(store().totals().discountTotal).toBe(60);

    // updateQty(key, 0) REMOVES the line, so the register reaches zero lines
    // without anything having called reset().
    store().setQty(store().lines[0].key, 0);
    expect(store().lines).toHaveLength(0);
    expect(store().discount.vouchers).toEqual([]);

    // The next customer, who presented no code, pays full price.
    store().add(CAKE);
    expect(store().sessionDiscount().total).toBe(0);
    expect(store().totals().discountTotal).toBe(0);
    expect(store().totals().total).toBe(220);
  });

  it("drops the discount when the last line is removed outright", () => {
    openRegister(SERVICE_CHARGE);
    store().add(LATTE);
    store().applyVoucher(SAVE20);

    store().remove(store().lines[0].key);
    expect(store().discount.vouchers).toEqual([]);

    store().add(CAKE);
    expect(store().totals().total).toBe(220);
  });

  it("clears both the discount and the attached guest on reset()", () => {
    openRegister(SERVICE_CHARGE);
    store().add(LATTE);
    store().applyVoucher(SAVE20);
    store().setCustomerName("Maria");
    store().setAttachedCustomer({
      id: "c-1",
      name: "Maria",
      phoneE164: "+639170000000",
      email: null,
    });

    store().reset();

    expect(store().discount.vouchers).toEqual([]);
    expect(store().discount.manual).toBeNull();
    expect(store().attachedCustomer).toBeNull();
    expect(store().customerName).toBe("");

    // Proven in pesos, not just in state: the next sale is undiscounted.
    store().add(CAKE);
    expect(store().totals().total).toBe(220);
  });

  it("clears both the discount and the attached guest on endEdit()", () => {
    openRegister(SERVICE_CHARGE);
    store().beginEdit(
      enterEditMode(
        {
          _id: "order-9",
          total: 500,
          items: [{ menuItemId: "m-pasta", menuItemName: "Pasta", quantity: 1, subtotal: 500 }],
        },
        [],
        {} as never,
      ),
    );
    store().applyVoucher(SAVE20);
    store().setAttachedCustomer({ id: "c-2", name: "Ben", phoneE164: null, email: "b@x.com" });

    store().endEdit();

    expect(store().editContext).toBeNull();
    expect(store().discount.vouchers).toEqual([]);
    expect(store().attachedCustomer).toBeNull();

    store().add(CAKE);
    expect(store().totals().total).toBe(220);
  });
});

describe("journey 4 — removing the item a voucher qualified for", () => {
  it("drops the discount on a live counter sale, because the rule no longer holds", () => {
    openRegister();
    store().add({ ...LATTE, quantity: 1 }); // ₱150
    store().add(CAKE); // ₱200
    store().applyVoucher(LATTE20);

    // 20% of the ₱150 latte only.
    expect(store().sessionDiscount().total).toBe(30);
    expect(store().totals().total).toBe(320);

    const latteKey = store().lines.find((line) => line.menuItemId === "m-latte")!.key;
    store().remove(latteKey);

    // The voucher is still held — the session stores inputs, never a figure —
    // but it now prices to nothing, and the cashier is told why.
    expect(store().discount.vouchers.map((v) => v.code)).toEqual(["LATTE20"]);
    expect(store().sessionDiscount().total).toBe(0);
    expect(store().sessionDiscount().rejected[0]?.reason).toBe("no_matching_items");
    expect(store().totals().total).toBe(200);
  });

  it("keeps a since-expired voucher's line on an EDIT, which is a lifecycle rule", () => {
    // The customer used this code validly at the time of sale. Stripping it
    // during an unrelated edit re-bills them for a reason nobody can explain.
    const retired = voucher({
      id: "v-old",
      code: "OLD20",
      name: "Retired 20%",
      endsAt: "2020-01-01T00:00:00Z",
      isActive: false,
    });

    openRegister();
    store().beginEdit(
      enterEditMode(
        {
          _id: "order-2",
          total: 400,
          deliveryFee: 0,
          items: [{ menuItemId: "m-cake", menuItemName: "Cake", quantity: 1, subtotal: 500 }],
          customerData: {
            discount: {
              total: 100,
              deliveryDiscount: 0,
              lines: [
                { label: retired.name, amount: 100, voucherId: retired.id, code: retired.code },
              ],
              allocationsByLine: {},
            },
          },
        },
        [],
        {} as never,
      ),
    );
    store().setEditVouchers([retired]);

    const totals = editModeTotals(store().lines, store().editContext!);
    expect(totals.newTotal).toBe(400);
    expect(
      revisedOrderTotal(totals.itemsTotal, store().editContext!.deliveryFee, totals.carriedChargesForSave),
    ).toBe(totals.newTotal);
  });
});

describe("the store and the cart engine agree on the sale's total", () => {
  it("derives totals() from cartTotals with the session's own discount lines", () => {
    openRegister(SERVICE_CHARGE);
    store().add(LATTE);
    store().applyVoucher(SAVE20);

    expect(store().totals()).toEqual(
      cartTotals(store().lines, SERVICE_CHARGE, store().sessionDiscount().lines),
    );
  });
});
