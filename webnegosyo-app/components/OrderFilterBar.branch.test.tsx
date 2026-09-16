/**
 * The orders screen has to be able to ASK about branches.
 *
 * The status pills were the only way to narrow the queue, so a multi-branch
 * merchant looking at "all" orders had no way to separate one branch's work
 * from another's — and no way at all to surface the orders that belong to no
 * branch, which is where a broken attribution quietly piles up.
 *
 * The branch row is additive: a merchant who is given no branches gets exactly
 * the bar that shipped, which is what keeps every single-location store and
 * every branch-locked account untouched.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { OrderFilterBar } from "./OrderFilterBar";

const STATUS_FILTERS = [{ key: "all", label: "All", count: 3 }];

const noop = () => {};

const baseProps = {
  filters: STATUS_FILTERS,
  activeFilter: "all",
  onFilterChange: noop,
  sort: "newest" as const,
  onSortToggle: noop,
  search: "",
  onSearchChange: noop,
};

describe("OrderFilterBar branch row", () => {
  it("renders nothing extra when no branches are offered", () => {
    // Arrange + Act
    const { queryByText } = render(<OrderFilterBar {...baseProps} />);

    // Assert: today's bar, for every single-location store.
    expect(queryByText("Unassigned")).toBeNull();
    expect(queryByText("All branches")).toBeNull();
  });

  it("offers each branch and the unassigned orders when branches are given", () => {
    // Arrange
    const branchFilters = [
      { key: "all", label: "All branches", count: 3 },
      { key: "o-moncada", label: "Moncada", count: 1 },
      { key: "__unassigned__", label: "Unassigned", count: 2 },
    ];

    // Act
    const { getByText } = render(
      <OrderFilterBar
        {...baseProps}
        branchFilters={branchFilters}
        activeBranchFilter="all"
        onBranchFilterChange={noop}
      />
    );

    // Assert: the question the merchant could not previously ask.
    expect(getByText("Unassigned")).toBeTruthy();
    expect(getByText("Moncada")).toBeTruthy();
  });
});
