import type { TrendBar } from "./profit-service";
import { trendColumns } from "./profit-trend-view";

const bar = (key: string, profitCents: number, netSalesCents: number, isIncomplete = false): TrendBar => ({
  key,
  label: key,
  profitCents,
  netSalesCents,
  isIncomplete,
});

describe("the trend columns", () => {
  it("scales profit and the faint sales behind it on one axis", () => {
    const { columns, hasLoss } = trendColumns([bar("a", 30_000, 100_000), bar("b", 10_000, 50_000, true)]);
    expect(hasLoss).toBe(false);
    expect(columns.map((column) => [column.profitShare, column.salesShare, column.isLoss, column.isIncomplete])).toEqual([
      [0.3, 1, false, false],
      [0.1, 0.5, false, true],
    ]);
  });

  it("draws a loss below the axis", () => {
    const { columns, hasLoss } = trendColumns([bar("a", 20_000, 40_000), bar("b", -10_000, 5_000)]);
    expect(hasLoss).toBe(true);
    expect(columns[1]).toMatchObject({ isLoss: true, profitShare: 0.25 });
  });

  it("never divides by zero", () => {
    const { columns } = trendColumns([bar("a", 0, 0), bar("b", 0, 0)]);
    for (const column of columns) {
      expect(column.profitShare).toBe(0);
      expect(column.salesShare).toBe(0);
    }
  });

  it("says each column for a screen reader, including a running one", () => {
    const { columns } = trendColumns([bar("Oct 19", -150_000, 400_000, true)]);
    expect(columns[0].spoken).toBe("Oct 19: lost ₱1,500 on ₱4,000 in sales, still running");
  });

});
