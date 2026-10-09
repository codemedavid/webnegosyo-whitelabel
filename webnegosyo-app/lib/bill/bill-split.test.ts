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
