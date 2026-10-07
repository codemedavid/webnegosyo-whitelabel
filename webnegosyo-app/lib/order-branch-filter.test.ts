/**
 * The merchant app could see per-branch orders and nothing else.
 *
 * `filterOrdersToScope` answers a question about ACCOUNTS: which orders is this
 * person allowed to see. A store-wide account passes that test with everything,
 * and then the orders screen offers no way to narrow it — so a two-branch
 * merchant could look at "every order" or, by drilling into a branch, at that
 * branch's orders, and the orders belonging to NO branch were only ever visible
 * mixed into the first list. Nothing on the screen even said they existed.
 *
 * This is the view-level filter that closes that gap. It is deliberately
 * separate from the scope: narrowing what you are looking at is a preference,
 * and must never be confused with what you are permitted to see.
 */

import {
  ORDER_BRANCH_FILTER_ALL,
  ORDER_BRANCH_FILTER_UNASSIGNED,
  filterOrdersToBranchFilter,
  listOrderBranchOptions,
  listOrderBranchPills,
  resolveOrderViewOutlet,
} from "./order-branch-filter";

const branchOrder = (id: string, name: string) => ({
  _id: `order-${id}`,
  customerData: { outlet_id: id, outlet_name: name },
});

const unassignedOrder = (suffix: string) => ({ _id: `order-none-${suffix}`, customerData: {} });

const MONCADA = branchOrder("o-moncada", "Moncada");
const CABANATUAN = branchOrder("o-cabanatuan", "Cabanatuan");
const ORPHAN = unassignedOrder("a");

describe("listOrderBranchOptions", () => {
  it("offers each branch that took an order, by name, sorted", () => {
    // Arrange + Act
    const options = listOrderBranchOptions([MONCADA, CABANATUAN, ORPHAN]);

    // Assert
    expect(options.map((option) => option.name)).toEqual(["Cabanatuan", "Moncada"]);
  });

  it("offers nothing for a merchant whose orders name no branch", () => {
    // Arrange + Act + Assert: a single-location store keeps today's screen.
    expect(listOrderBranchOptions([ORPHAN, unassignedOrder("b")])).toEqual([]);
  });
});

describe("filterOrdersToBranchFilter", () => {
  it("returns every order under the all filter", () => {
    // Arrange
    const orders = [MONCADA, ORPHAN, CABANATUAN];

    // Act + Assert
    expect(filterOrdersToBranchFilter(ORDER_BRANCH_FILTER_ALL, orders)).toEqual(orders);
  });

  it("returns one branch's orders under that branch's id", () => {
    // Arrange + Act
    const filtered = filterOrdersToBranchFilter("o-moncada", [MONCADA, ORPHAN, CABANATUAN]);

    // Assert
    expect(filtered).toEqual([MONCADA]);
  });

  it("returns the orders belonging to no branch under the unassigned filter", () => {
    // Arrange + Act
    const filtered = filterOrdersToBranchFilter(ORDER_BRANCH_FILTER_UNASSIGNED, [
      MONCADA,
      ORPHAN,
      CABANATUAN,
    ]);

    // Assert: this is the list the merchant had no way to ask for.
    expect(filtered).toEqual([ORPHAN]);
  });

  it("survives an absent order list", () => {
    // Arrange + Act + Assert
    expect(filterOrdersToBranchFilter(ORDER_BRANCH_FILTER_ALL, undefined)).toEqual([]);
  });
});

describe("resolveOrderViewOutlet", () => {
  const ALL = { kind: "all" } as const;
  const NORTH = { kind: "branch", outletId: "o-north" } as const;

  it("asks for nothing extra when an owner looks at every branch", () => {
    expect(resolveOrderViewOutlet(ALL, ALL, ORDER_BRANCH_FILTER_ALL)).toBeNull();
  });

  it("asks for the branch an owner drilled into", () => {
    expect(resolveOrderViewOutlet(ALL, NORTH, ORDER_BRANCH_FILTER_ALL)).toBe("o-north");
  });

  it("asks for the branch pill an owner picked", () => {
    expect(resolveOrderViewOutlet(ALL, ALL, "o-south")).toBe("o-south");
    expect(resolveOrderViewOutlet(ALL, ALL, ORDER_BRANCH_FILTER_UNASSIGNED)).toBe(
      ORDER_BRANCH_FILTER_UNASSIGNED
    );
  });

  it("asks for nothing for a branch account — the server already confines it", () => {
    expect(resolveOrderViewOutlet(NORTH, NORTH, "o-south")).toBeNull();
  });
});

describe("listOrderBranchPills", () => {
  it("offers every branch in the directory, even one with no order on screen", () => {
    const pills = listOrderBranchPills([{ id: "o-quiet", name: "Quiet" }], [MONCADA]);

    expect(pills.map((pill) => pill.id)).toEqual(["o-moncada", "o-quiet"]);
  });

  it("prefers the directory's current name over the one stamped on an order", () => {
    const pills = listOrderBranchPills([{ id: "o-moncada", name: "Moncada Main" }], [MONCADA]);

    expect(pills).toEqual([{ id: "o-moncada", name: "Moncada Main" }]);
  });

  it("falls back to the orders when the directory is empty", () => {
    expect(listOrderBranchPills([], [MONCADA])).toEqual([{ id: "o-moncada", name: "Moncada" }]);
  });
});
