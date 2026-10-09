import { EMPTY_PLAN, assignUnit, recordPartPayment, setGuests, setMode } from "./bill-plan";
import { billPartViews, groupUnits, itemSplitBlockedReason } from "./bill-parts";
import { billUnits } from "./bill-split";
import { ROUND_ONE, ROUND_TWO } from "./bill-fixtures";

const NOW = 1_700_001_000_000;
const orders = [ROUND_ONE, ROUND_TWO];

describe("billPartViews", () => {
  it("has no guest cards for one bill", () => {
    expect(billPartViews(orders, EMPTY_PLAN, NOW).parts).toEqual([]);
  });

  it("splits what was owed when even was chosen, and tracks each guest's payment", () => {
    const plan = recordPartPayment(setGuests(setMode(EMPTY_PLAN, "even", 56000), 3), "even:1", 18667);

    const { parts } = billPartViews(orders, plan, NOW);

    expect(parts.map((p) => [p.label, p.amountCents, p.remainingCents, p.isPaid])).toEqual([
      ["Guest 1", 18667, 18667, false],
      ["Guest 2", 18667, 0, true],
      ["Guest 3", 18666, 18666, false],
    ]);
    expect(parts[0].receipt(0).bill?.share?.amount).toBe(186.67);
  });

  it("prices each guest by what they had, and knows which orders it settles", () => {
    const cake = billUnits(orders).find((u) => u.item.menuItemName === "Cake")!;
    const plan = assignUnit(setMode(EMPTY_PLAN, "items", 56000), cake.id, 1);

    const { parts, unassigned } = billPartViews(orders, plan, NOW);

    expect(parts[1]).toMatchObject({ label: "Guest 2", amountCents: 8800, preferred: { "order-b": 8800 } });
    expect(parts[0].amountCents).toBe(0);
    expect(unassigned).toHaveLength(4);
  });
});

describe("itemSplitBlockedReason", () => {
  it("allows a by-item split while nothing has been paid", () => {
    expect(itemSplitBlockedReason(orders, EMPTY_PLAN)).toBeNull();
  });

  it("blocks it once money was taken outside the split", () => {
    expect(itemSplitBlockedReason([{ ...ROUND_ONE, amountPaid: 100 }, ROUND_TWO], EMPTY_PLAN)).toMatch(
      /already been paid/,
    );
  });

  it("does not block a split whose own guests made the payments", () => {
    const plan = recordPartPayment(setMode(EMPTY_PLAN, "items", 0), "items:0", 10000);

    expect(itemSplitBlockedReason([{ ...ROUND_ONE, amountPaid: 100 }, ROUND_TWO], plan)).toBeNull();
  });
});

describe("groupUnits", () => {
  it("shows identical pieces as one row with a count", () => {
    const rows = groupUnits(billUnits(orders));

    expect(rows.find((r) => r.name === "Latte")).toMatchObject({ count: 3, unitIds: expect.any(Array) });
    expect(rows).toHaveLength(3);
  });
});
