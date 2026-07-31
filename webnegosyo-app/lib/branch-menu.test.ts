/**
 * Turning a dish off at one branch must not cost that branch its own price.
 *
 * The override table holds differences, so the obvious implementation of "turn
 * it back on" — delete the row — silently discards the branch price and sale
 * the merchant set weeks ago, and the branch quietly starts charging the
 * store-wide amount. These tests pin the two halves apart: a row that says
 * nothing but "not here" goes away when the dish comes back, and a row that
 * also carries money stays.
 */

import {
  INHERITED_BRANCH_VALUES,
  planBranchListingWrite,
  buildBranchProductRows,
  type BranchMenuOverrideValues,
} from "./branch-menu";
import type { OutletMenuOverrideRow } from "./outlet-menu-overrides";
import { buildOutletMenuIndex } from "./outlet-menu-overrides";

function overrideRow(
  partial: Partial<OutletMenuOverrideRow> = {},
): OutletMenuOverrideRow {
  return {
    outlet_id: "branch-a",
    menu_item_id: "adobo",
    is_listed: true,
    is_available: true,
    price: null,
    discounted_price: null,
    discount_cleared: false,
    ...partial,
  };
}

describe("planBranchListingWrite", () => {
  it("inserts a row when a branch first declines a dish", () => {
    // Arrange
    const current = null;

    // Act
    const plan = planBranchListingWrite(current, false);

    // Assert
    expect(plan.kind).toBe("upsert");
    expect(plan.kind === "upsert" && plan.values).toEqual<BranchMenuOverrideValues>({
      ...INHERITED_BRANCH_VALUES,
      is_listed: false,
    });
  });

  it("removes the row when the only thing it said was 'not here'", () => {
    // Arrange
    const current = overrideRow({ is_listed: false });

    // Act
    const plan = planBranchListingWrite(current, true);

    // Assert: back to inheriting, not a row of store-wide defaults — the
    // owner's cross-branch views count rows to answer "did anyone change this?"
    expect(plan.kind).toBe("delete");
  });

  it("keeps a branch's own price when the dish comes back on", () => {
    // Arrange
    const current = overrideRow({ is_listed: false, price: 160 });

    // Act
    const plan = planBranchListingWrite(current, true);

    // Assert
    expect(plan.kind).toBe("upsert");
    expect(plan.kind === "upsert" && plan.values.price).toBe(160);
    expect(plan.kind === "upsert" && plan.values.is_listed).toBe(true);
  });

  it("keeps a branch's sold-out mark when the dish is taken off the board", () => {
    // Arrange
    const current = overrideRow({ is_available: false });

    // Act
    const plan = planBranchListingWrite(current, false);

    // Assert
    expect(plan.kind === "upsert" && plan.values.is_available).toBe(false);
    expect(plan.kind === "upsert" && plan.values.is_listed).toBe(false);
  });

  it("writes nothing when the branch already says what was asked", () => {
    // Arrange: no row means the branch carries it, which is what "on" asks for
    const current = null;

    // Act
    const plan = planBranchListingWrite(current, true);

    // Assert
    expect(plan.kind).toBe("noop");
  });

  it("treats a zero branch price as a real price, not as unset", () => {
    // Arrange: a giveaway dish. Reading 0 as "inherit" would start charging.
    const current = overrideRow({ is_listed: false, price: 0 });

    // Act
    const plan = planBranchListingWrite(current, true);

    // Assert
    expect(plan.kind).toBe("upsert");
    expect(plan.kind === "upsert" && plan.values.price).toBe(0);
  });
});

describe("buildBranchProductRows", () => {
  const products = [
    { id: "adobo", name: "Adobo", price: 180, discounted_price: null, is_available: true },
    { id: "halo", name: "Halo-halo", price: 120, discounted_price: null, is_available: true },
  ];
  const branches = [
    { id: "branch-a", name: "Makati" },
    { id: "branch-b", name: "Pasig" },
  ];

  it("marks each branch on or off for every product", () => {
    // Arrange
    const index = buildOutletMenuIndex([
      overrideRow({ outlet_id: "branch-b", menu_item_id: "adobo", is_listed: false }),
    ]);

    // Act
    const rows = buildBranchProductRows(products, branches, index);

    // Assert
    const adobo = rows.find((row) => row.product.id === "adobo");
    expect(adobo?.branches.map((b) => b.isListed)).toEqual([true, false]);
    expect(adobo?.listedCount).toBe(1);
  });

  it("prices each branch the way the customer is charged there", () => {
    // Arrange
    const index = buildOutletMenuIndex([
      overrideRow({ outlet_id: "branch-a", menu_item_id: "adobo", price: 160 }),
    ]);

    // Act
    const rows = buildBranchProductRows(products, branches, index);

    // Assert
    const adobo = rows.find((row) => row.product.id === "adobo");
    expect(adobo?.branches[0].price).toBe(160);
    expect(adobo?.branches[1].price).toBe(180);
  });

  it("reports a branch as sold out without dropping it from the list", () => {
    // Arrange: the merchant needs to see it to switch it back, so it stays.
    const index = buildOutletMenuIndex([
      overrideRow({ outlet_id: "branch-a", menu_item_id: "halo", is_available: false }),
    ]);

    // Act
    const rows = buildBranchProductRows(products, branches, index);

    // Assert
    const halo = rows.find((row) => row.product.id === "halo");
    expect(halo?.branches[0]).toMatchObject({ isListed: true, isAvailable: false });
  });

  it("shows a dish the whole store has 86'd as unavailable at every branch", () => {
    // Arrange: is_available composes with AND — a branch cannot un-86 it, and
    // a screen that showed it as sellable here would be lying about the till.
    const offEverywhere = [
      { id: "adobo", name: "Adobo", price: 180, discounted_price: null, is_available: false },
    ];

    // Act
    const rows = buildBranchProductRows(offEverywhere, branches, buildOutletMenuIndex([]));

    // Assert
    expect(rows[0].branches.every((b) => b.isAvailable === false)).toBe(true);
    expect(rows[0].isOffStoreWide).toBe(true);
  });

  it("says nothing about branches when the store has none", () => {
    // Act
    const rows = buildBranchProductRows(products, [], buildOutletMenuIndex([]));

    // Assert
    expect(rows[0].branches).toEqual([]);
    expect(rows[0].label).toBeNull();
  });

  it("labels a dish that only some branches carry", () => {
    // Arrange
    const index = buildOutletMenuIndex([
      overrideRow({ outlet_id: "branch-b", menu_item_id: "adobo", is_listed: false }),
    ]);

    // Act
    const rows = buildBranchProductRows(products, branches, index);

    // Assert: the shared summary rule, not a second opinion on it
    expect(rows.find((r) => r.product.id === "adobo")?.label?.text).toBe("1 of 2 branches");
    expect(rows.find((r) => r.product.id === "halo")?.label).toBeNull();
  });
});
