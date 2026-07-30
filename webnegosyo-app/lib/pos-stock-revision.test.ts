/**
 * The stock an order edit has to move.
 *
 * Placing the order already spent its ingredients, so an edit moves only the
 * DIFFERENCE. Re-depleting the whole order double-spends; forgetting a removed
 * item leaves stock permanently short. Both are invisible until someone sells
 * something they do not have.
 *
 * Identity is the menu item PLUS its selected options, not the menu item alone.
 * `lib/order-stock-delta.ts` groups by menu item, which is wrong for stock: a
 * Small Latte and a Large Latte are one menu item but different quantities of
 * milk, so swapping one for the other must move stock, not net to zero.
 */

import { posStockRevision } from "./pos-stock-revision";
import type { PosStockItem } from "./pos-stock";

const latte = (quantity: number, ...optionIds: string[]): PosStockItem => ({
  menuItemId: "item-latte",
  quantity,
  optionIds,
});

describe("posStockRevision", () => {
  it("moves nothing when the order did not change", () => {
    const revision = posStockRevision([latte(2)], [latte(2)]);

    expect(revision.deplete).toEqual([]);
    expect(revision.restore).toEqual([]);
  });

  it("spends only the added units, not the whole order", () => {
    // 2 lattes became 3. One latte's ingredients, not three.
    const revision = posStockRevision([latte(2)], [latte(3)]);

    expect(revision.deplete).toEqual([latte(1)]);
    expect(revision.restore).toEqual([]);
  });

  it("returns the removed units to the shelf", () => {
    const revision = posStockRevision([latte(3)], [latte(1)]);

    expect(revision.restore).toEqual([latte(2)]);
    expect(revision.deplete).toEqual([]);
  });

  it("spends a whole line that was added", () => {
    const revision = posStockRevision([], [latte(2)]);

    expect(revision.deplete).toEqual([latte(2)]);
  });

  it("returns a whole line that was removed", () => {
    const revision = posStockRevision([latte(2)], []);

    expect(revision.restore).toEqual([latte(2)]);
  });

  /**
   * The reason identity includes options. `order-stock-delta.ts` groups by menu
   * item and would net this to zero — but a Large Latte is more milk than a
   * Small one, so netting silently leaves the ledger short by the difference.
   */
  it("treats a size swap as a real movement, not a no-op", () => {
    const revision = posStockRevision(
      [latte(1, "opt-small")],
      [latte(1, "opt-large")],
    );

    expect(revision.restore).toEqual([latte(1, "opt-small")]);
    expect(revision.deplete).toEqual([latte(1, "opt-large")]);
  });

  it("does not split a line because its options were chosen in a different order", () => {
    // Selection order is a UI accident; the same drink must stack either way.
    const revision = posStockRevision(
      [latte(1, "opt-large", "opt-oat")],
      [latte(1, "opt-oat", "opt-large")],
    );

    expect(revision.deplete).toEqual([]);
    expect(revision.restore).toEqual([]);
  });

  it("nets duplicate lines of the same configuration together", () => {
    // The register can hold one configuration across two lines (different
    // kitchen notes). To stock they are the same three drinks.
    const revision = posStockRevision([latte(1), latte(2)], [latte(3)]);

    expect(revision.deplete).toEqual([]);
    expect(revision.restore).toEqual([]);
  });

  it("reports both directions when one item grew and another shrank", () => {
    const bun: PosStockItem = { menuItemId: "item-bun", quantity: 2, optionIds: [] };
    const revision = posStockRevision([latte(1), bun], [latte(3)]);

    expect(revision.deplete).toEqual([latte(2)]);
    expect(revision.restore).toEqual([bun]);
  });

  it("carries the option ids through so modifier recipes still resolve", () => {
    // Depletion feeds these to the variation- and modifier-option recipe
    // buckets. Dropping them would spend only the base recipe.
    const revision = posStockRevision([], [latte(1, "opt-large", "opt-oat")]);

    expect(revision.deplete[0].optionIds.slice().sort()).toEqual([
      "opt-large",
      "opt-oat",
    ]);
  });

  it("ignores a line with no menu item rather than moving stock against nothing", () => {
    // A menu item deleted after the sale leaves nothing to resolve a recipe on.
    const orphan: PosStockItem = { menuItemId: "", quantity: 2, optionIds: [] };
    const revision = posStockRevision([], [orphan]);

    expect(revision.deplete).toEqual([]);
  });

  it("ignores a non-positive quantity", () => {
    const broken: PosStockItem = { menuItemId: "item-latte", quantity: 0, optionIds: [] };
    const revision = posStockRevision([], [broken]);

    expect(revision.deplete).toEqual([]);
  });

  it("reports whether anything moves at all", () => {
    // The caller skips the network round trip entirely when nothing does.
    expect(posStockRevision([latte(2)], [latte(2)]).hasMovement).toBe(false);
    expect(posStockRevision([latte(2)], [latte(3)]).hasMovement).toBe(true);
  });
});
