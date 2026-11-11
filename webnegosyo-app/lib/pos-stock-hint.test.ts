/**
 * The small "N left" / "0 left" badge on a register tile (and on an option in
 * the picker). Quiet above the storefront's own hint threshold, so the grid
 * does not cry shortage on every dish; never the words "sold out", which are
 * the merchant's switch.
 */

import * as fs from "fs";
import * as path from "path";
import { describeStockHint, STOCK_HINT_THRESHOLD, unitsByDish } from "./pos-stock-hint";

describe("describeStockHint", () => {
  it("says nothing about an untracked dish", () => {
    expect(describeStockHint(undefined, 0)).toBeNull();
  });

  it("says nothing while plenty is left", () => {
    expect(describeStockHint(STOCK_HINT_THRESHOLD + 1, 0)).toBeNull();
  });

  it("counts down what is left after this sale", () => {
    expect(describeStockHint(STOCK_HINT_THRESHOLD, 0)).toEqual({ label: `${STOCK_HINT_THRESHOLD} left`, isOut: false });
    expect(describeStockHint(4, 1)).toEqual({ label: "3 left", isOut: false });
  });

  it("shows 0 left — still a dish on sale — when the estimate is empty", () => {
    expect(describeStockHint(0, 0)).toEqual({ label: "0 left", isOut: true });
    expect(describeStockHint(2, 2)).toEqual({ label: "0 left", isOut: true });
    expect(describeStockHint(-3, 0)).toEqual({ label: "0 left", isOut: true });
  });
});

describe("unitsByDish", () => {
  it("adds up the sale's demand per dish", () => {
    expect(
      unitsByDish([
        { menuItemId: "a", name: "A", quantity: 2, options: [] },
        { menuItemId: "a", name: "A", quantity: 1, options: [] },
        { menuItemId: "b", name: "B", quantity: 4, options: [] },
      ]),
    ).toEqual({ a: 3, b: 4 });
  });
});

describe("parity with the storefront", () => {
  it("uses the web stepper's hint threshold", () => {
    const web = fs.readFileSync(path.join(__dirname, "../../src/lib/inventory/stepper-cap.ts"), "utf8");
    const match = web.match(/export const STOCK_HINT_THRESHOLD = (\d+)/);
    expect(match).not.toBeNull();
    expect(STOCK_HINT_THRESHOLD).toBe(Number(match?.[1]));
  });
});
