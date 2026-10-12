import {
  discountColumnsForCreate,
  discountPatchForRevision,
  lineDiscountAmounts,
} from "./order-discount-columns";
import { buildCreateOrderRows, type CreateOrderArgs } from "./supabase-orders";
import { buildRevisionRows } from "./order-revise";

const PAYLOAD = {
  total: 30,
  deliveryDiscount: 0,
  lines: [{ label: "Senior 20%", amount: 30 }],
  allocationsByLine: { "line-1": 30 },
};

describe("discountColumnsForCreate", () => {
  it("copies the register's blob into the reporting columns", () => {
    expect(discountColumnsForCreate({ discount: PAYLOAD, table: "4" })).toEqual({
      discount_total: 30,
      discount_data: PAYLOAD,
    });
  });

  it("writes a zero total and no payload for an undiscounted sale", () => {
    expect(discountColumnsForCreate({ table: "4" })).toEqual({
      discount_total: 0,
      discount_data: null,
    });
    expect(discountColumnsForCreate(null)).toEqual({ discount_total: 0, discount_data: null });
  });

  it("ignores a malformed blob rather than reporting it", () => {
    expect(discountColumnsForCreate({ discount: { total: "lots" } }).discount_total).toBe(0);
  });
});

describe("discountPatchForRevision", () => {
  it("says nothing when the edit settled nothing", () => {
    expect(discountPatchForRevision(undefined, { discount: PAYLOAD })).toBeUndefined();
  });

  it("moves the blob with the columns, keeping every other field", () => {
    const next = { ...PAYLOAD, total: 10, lines: [{ label: "Senior 20%", amount: 10 }] };

    const patch = discountPatchForRevision(next, { discount: PAYLOAD, table: "4" });

    expect(patch).toEqual({
      discount_total: 10,
      discount_data: next,
      customer_data: { table: "4", discount: next },
    });
  });

  it("removes the blob when the discount is gone", () => {
    const patch = discountPatchForRevision(null, { discount: PAYLOAD, table: "4" });

    expect(patch).toEqual({
      discount_total: 0,
      discount_data: null,
      customer_data: { table: "4" },
    });
  });
});

describe("lineDiscountAmounts", () => {
  it("reads each line's allocation in order, zero where none", () => {
    expect(lineDiscountAmounts(PAYLOAD, 3)).toEqual([0, 30, 0]);
  });

  it("treats junk allocations as nothing", () => {
    const junk = { ...PAYLOAD, allocationsByLine: { "line-0": -5, "line-1": Number.NaN } };
    expect(lineDiscountAmounts(junk, 2)).toEqual([0, 0]);
    expect(lineDiscountAmounts(null, 2)).toEqual([0, 0]);
  });
});

describe("platform order rows carry the discount columns", () => {
  const sale: CreateOrderArgs = {
    customerName: "Walk-in",
    customerContact: "",
    customerData: { discount: PAYLOAD },
    total: 170,
    itemCount: 2,
    source: "pos",
    items: [
      { menuItemId: "", menuItemName: "Rice", quantity: 1, price: 50, subtotal: 50 },
      { menuItemId: "", menuItemName: "Sisig", quantity: 1, price: 150, subtotal: 150 },
    ],
  } as CreateOrderArgs;

  it("writes discount_total and discount_data on create", () => {
    const { order } = buildCreateOrderRows("t1", sale);

    expect(order.discount_total).toBe(30);
    expect(order.discount_data).toEqual(PAYLOAD);
  });

  it("writes each line's share into order_items.discount_amount", () => {
    const { items } = buildCreateOrderRows("t1", sale);

    expect(items.map((item) => item.discount_amount)).toEqual([0, 30]);
  });

  it("refreshes the blob, the columns and the line shares on revise", () => {
    const next = { ...PAYLOAD, total: 20, allocationsByLine: { "line-0": 20 } };

    const { orderPatch, itemRows } = buildRevisionRows(
      "t1",
      {
        orderId: "o1",
        expectedRevisionNumber: 0,
        items: [{ menuItemId: "", menuItemName: "Sisig", quantity: 1, price: 150, subtotal: 150 }],
        serviceChargeAmount: -20,
        discount: next,
      },
      { revisionNumber: 0, total: 170, items: [], customerData: { discount: PAYLOAD, table: "2" } },
    );

    expect(orderPatch.discount_total).toBe(20);
    expect(orderPatch.customer_data).toEqual({ table: "2", discount: next });
    expect(itemRows[0].discount_amount).toBe(20);
  });

  it("leaves the stored discount alone when the edit settled none", () => {
    const { orderPatch } = buildRevisionRows(
      "t1",
      {
        orderId: "o1",
        expectedRevisionNumber: 0,
        items: [{ menuItemId: "", menuItemName: "Sisig", quantity: 1, price: 150, subtotal: 150 }],
      },
      { revisionNumber: 0, total: 150, items: [], customerData: { discount: PAYLOAD } },
    );

    expect(orderPatch).not.toHaveProperty("discount_total");
    expect(orderPatch).not.toHaveProperty("customer_data");
  });
});
