/**
 * The stock-ceiling read is keyed on WHICH dishes are in the sale, not on how
 * many of each: the ceiling is what the kitchen can make, and tapping "+" on a
 * line does not change that. Order does not matter either, so removing and
 * re-adding a line lands on the same key.
 */
// The module also exports the fetch, whose web URL reads expo-constants.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://shop.test" } } },
}));

import { lineIdSetKey } from "./pos-stock-ceilings";

describe("lineIdSetKey", () => {
  it("is empty for an empty sale", () => {
    expect(lineIdSetKey([])).toBe("");
  });

  it("ignores quantity and order, and de-duplicates lines of one dish", () => {
    const a = lineIdSetKey([
      { menuItemId: "m-2", quantity: 1 },
      { menuItemId: "m-1", quantity: 3 },
      { menuItemId: "m-2", quantity: 2 },
    ]);
    const b = lineIdSetKey([
      { menuItemId: "m-1", quantity: 1 },
      { menuItemId: "m-2", quantity: 1 },
    ]);

    expect(a).toBe(b);
  });

  it("changes when a new dish enters the sale", () => {
    const before = lineIdSetKey([{ menuItemId: "m-1", quantity: 1 }]);
    const after = lineIdSetKey([
      { menuItemId: "m-1", quantity: 1 },
      { menuItemId: "m-3", quantity: 1 },
    ]);

    expect(after).not.toBe(before);
  });
});
