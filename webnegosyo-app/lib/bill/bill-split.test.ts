import { billUnits, evenShareCents, itemParts } from "./bill-split";
import { ROUND_ONE, ROUND_TWO, billOrder } from "./bill-fixtures";

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("split evenly", () => {
  it("shares the amount so the shares add back to it exactly", () => {
    expect(evenShareCents(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(sum(evenShareCents(56000, 7))).toBe(56000);
  });

  it("refuses fewer than one guest", () => {
    expect(evenShareCents(100, 0)).toEqual([]);
  });
});

describe("bill units", () => {
  const units = billUnits([ROUND_ONE, ROUND_TWO]);

  it("breaks every line into one unit per piece", () => {
    expect(units.filter((u) => u.item.menuItemName === "Latte")).toHaveLength(3);
    expect(units).toHaveLength(5);
  });

  it("prices each order's units so they add back to that order's total", () => {
    for (const order of [ROUND_ONE, ROUND_TWO]) {
      const own = units.filter((u) => u.orderId === order._id);
      expect(sum(own.map((u) => u.totalCents))).toBe(order.total * 100);
    }
  });

  it("carries a share of the service charge on each unit of a serviced order", () => {
    const cake = units.find((u) => u.item.menuItemName === "Cake");

    expect(cake?.serviceCents).toBe(800);
    expect(cake?.totalCents).toBe(8800);
  });

  it("shares a discount across the units by their price", () => {
    const discounted = billOrder({
      _id: "d",
      total: 90,
      customerData: { discount: { total: 10, lines: [{ label: "SUKI", amount: 10 }] } },
      items: [
        { orderId: "d", menuItemName: "Tea", quantity: 1, subtotal: 50 },
        { orderId: "d", menuItemName: "Bun", quantity: 1, subtotal: 50 },
      ],
    });

    const [tea, bun] = billUnits([discounted]);

    expect(tea.discountLines).toEqual([{ label: "SUKI", cents: 500 }]);
    expect(tea.totalCents + bun.totalCents).toBe(9000);
  });

  it("puts a one-item discount on that dish's own piece, not across the table", () => {
    // 5 fries (₱560) + a burger (₱150); "50% off ONE fries" (₱56) and a
    // cashier's ₱20 off the burger. The guest who takes the discounted fries
    // pays ₱56; the other fries stay ₱112; the burger ₱130.
    const order = billOrder({
      _id: "f",
      total: 634,
      customerData: {
        discount: {
          total: 76,
          lines: [
            { label: "FRIES50", amount: 56, code: "FRIES50", items: [{ lineKey: "line-0", units: 1, amount: 56 }] },
            { label: "Discount — Cold", amount: 20, items: [{ lineKey: "line-1", units: 1, amount: 20 }] },
          ],
          allocationsByLine: { "line-0": 56, "line-1": 20 },
        },
      },
      items: [
        { orderId: "f", menuItemName: "Fries", quantity: 5, subtotal: 560 },
        { orderId: "f", menuItemName: "Burger", quantity: 1, subtotal: 150 },
      ],
    });

    const units = billUnits([order]);

    expect(units.map((u) => u.totalCents)).toEqual([5600, 11200, 11200, 11200, 11200, 13000]);
    expect(units[0].discountLines).toEqual([{ label: "FRIES50", cents: 5600 }]);
    expect(units[1].discountLines).toEqual([]);
    expect(sum(units.map((u) => u.totalCents))).toBe(63400);
  });

  it("puts two discounts on the same dish on different pieces", () => {
    const order = billOrder({
      _id: "g",
      total: 336,
      customerData: {
        discount: {
          total: 224,
          lines: [
            { label: "A", amount: 112, code: "A", items: [{ lineKey: "line-0", units: 1, amount: 112 }] },
            { label: "Discount — B", amount: 112, items: [{ lineKey: "line-0", units: 1, amount: 112 }] },
          ],
        },
      },
      items: [{ orderId: "g", menuItemName: "Fries", quantity: 5, subtotal: 560 }],
    });

    expect(billUnits([order]).map((u) => u.totalCents)).toEqual([0, 0, 11200, 11200, 11200]);
  });

  it("puts a Senior/PWD discount on the claimant's own dish, not across the table", () => {
    // A senior's ₱560 sisig at a VAT store (₱160 off) beside a companion's
    // ₱200 tea. Whoever takes the sisig takes the discount.
    const seniorTable = billOrder({
      _id: "s",
      total: 600,
      customerData: {
        discount: {
          total: 160,
          deliveryDiscount: 0,
          lines: [
            { label: "SC VAT exemption · J. Dela Cruz", amount: 60 },
            { label: "SC 20% · J. Dela Cruz", amount: 100 },
          ],
          allocationsByLine: { "line-0": 160 },
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
                grossShare: 560,
                vatExemptSales: 500,
                vatRemoved: 60,
                discount: 100,
                netDue: 400,
                serviceChargeShare: 0,
                serviceChargeVatRemoved: 0,
                reduction: 160,
                lineReductions: { "line-0": 160 },
              },
            ],
          },
        },
      },
      items: [
        { orderId: "s", menuItemName: "Sisig", quantity: 1, subtotal: 560 },
        { orderId: "s", menuItemName: "Tea", quantity: 1, subtotal: 200 },
      ],
    });

    const [sisig, tea] = billUnits([seniorTable]);

    expect(sisig.totalCents).toBe(40000);
    expect(sisig.discountLines).toEqual([{ label: "Senior/PWD discount", cents: 16000 }]);
    expect(tea.totalCents).toBe(20000);
    expect(tea.discountLines).toEqual([]);
  });

  it("keeps an order with no lines payable as one unit of charges", () => {
    const feeOnly = billOrder({ _id: "f", total: 60, deliveryFee: 60 });

    const [unit] = billUnits([feeOnly]);

    expect(unit.item.menuItemName).toBe("Other charges");
    expect(unit.totalCents).toBe(6000);
  });
});

describe("split by item", () => {
  const units = billUnits([ROUND_ONE, ROUND_TWO]);
  const latteIds = units.filter((u) => u.item.menuItemName === "Latte").map((u) => u.id);

  it("gives each guest the units they were assigned and lists the rest as unassigned", () => {
    const { parts, unassigned } = itemParts(units, { [latteIds[0]]: 0, [latteIds[2]]: 1 }, 2);

    expect(parts[0].units.map((u) => u.id)).toEqual([latteIds[0]]);
    expect(parts[1].totalCents).toBe(13200);
    expect(unassigned).toHaveLength(3);
  });

  it("adds back to the whole bill once every unit is assigned", () => {
    const assignment = Object.fromEntries(units.map((u, i) => [u.id, i % 3]));

    const { parts, unassigned } = itemParts(units, assignment, 3);

    expect(unassigned).toHaveLength(0);
    expect(sum(parts.map((p) => p.totalCents))).toBe(56000);
  });

  it("knows how much of each guest's share belongs to each order", () => {
    const assignment = Object.fromEntries(units.map((u) => [u.id, 0]));

    const [part] = itemParts(units, assignment, 1).parts;

    expect(part.byOrder).toEqual({ "order-a": 34000, "order-b": 22000 });
  });

  it("ignores an assignment to a guest who is no longer at the table", () => {
    const { parts, unassigned } = itemParts(units, { [latteIds[0]]: 5 }, 2);

    expect(parts.every((p) => p.units.length === 0)).toBe(true);
    expect(unassigned).toHaveLength(5);
  });
});
