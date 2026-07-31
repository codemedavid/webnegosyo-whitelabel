/**
 * The reads and writes behind the owner's cross-branch product screen.
 *
 * Two things are worth a test at this layer rather than at the pure one. A
 * failed override read must throw: an empty override set is the positive claim
 * "every branch carries everything at the store price", and a screen that
 * showed that after a network error would invite the owner to switch a dish
 * "back on" that was never off. And a partial upsert must never be sent — the
 * row carries a branch's price, sale and sold-out mark in the same columns, so
 * writing only `is_listed` resets the rest to their defaults.
 */

const from = jest.fn();

jest.mock("./supabase", () => ({
  supabase: {
    get from() {
      return from;
    },
  },
}));

import { listBranchMenuOverrides, setBranchListing } from "./branch-menu-service";

const EXISTING = {
  outlet_id: "branch-a",
  menu_item_id: "adobo",
  is_listed: true,
  is_available: true,
  price: 160,
  discounted_price: null,
  discount_cleared: false,
};

/** A PostgREST-ish chain resolving to `result` however it is filtered. */
function chain(result: { data: unknown; error: unknown }) {
  const settled = Promise.resolve(result);
  const builder: Record<string, unknown> = {};
  ["select", "eq", "in", "order", "upsert", "delete", "update", "insert"].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.maybeSingle = jest.fn(() => settled);
  builder.single = jest.fn(() => settled);
  builder.then = settled.then.bind(settled);
  return builder;
}

beforeEach(() => {
  from.mockReset();
});

describe("listBranchMenuOverrides", () => {
  it("returns every override the store has", async () => {
    // Arrange
    from.mockImplementation(() => chain({ data: [EXISTING], error: null }));

    // Act
    const rows = await listBranchMenuOverrides("t1");

    // Assert
    expect(rows).toEqual([EXISTING]);
  });

  it("throws rather than reporting a store with no branch differences", async () => {
    // Arrange
    from.mockImplementation(() => chain({ data: null, error: { message: "network" } }));

    // Act + Assert
    await expect(listBranchMenuOverrides("t1")).rejects.toThrow("network");
  });
});

describe("setBranchListing", () => {
  it("writes the whole row so a branch price survives being switched off", async () => {
    // Arrange
    const builder = chain({ data: EXISTING, error: null });
    from.mockImplementation(() => builder);

    // Act
    await setBranchListing("t1", "branch-a", "adobo", false);

    // Assert
    const upsert = builder.upsert as jest.Mock;
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      tenant_id: "t1",
      outlet_id: "branch-a",
      menu_item_id: "adobo",
      is_listed: false,
      price: 160,
    });
  });

  it("removes a row that only said 'not here' when the dish comes back", async () => {
    // Arrange
    const builder = chain({
      data: { ...EXISTING, is_listed: false, price: null },
      error: null,
    });
    from.mockImplementation(() => builder);

    // Act
    await setBranchListing("t1", "branch-a", "adobo", true);

    // Assert
    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.upsert).not.toHaveBeenCalled();
  });

  it("writes nothing when the branch already carries the dish", async () => {
    // Arrange: no row at all
    const builder = chain({ data: null, error: null });
    from.mockImplementation(() => builder);

    // Act
    await setBranchListing("t1", "branch-a", "adobo", true);

    // Assert
    expect(builder.upsert).not.toHaveBeenCalled();
    expect(builder.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["taking a dish off a branch", false, "upsert"],
    ["putting a dish back on a branch", true, "delete"],
  ])("reports a failed write when %s", async (_case, isListed, _op) => {
    // Arrange: the row reads fine, the write does not. Reporting success here
    // would leave the switch showing a change the branch never got.
    const stored = { ...EXISTING, is_listed: !isListed, price: null };
    let reads = 0;
    from.mockImplementation(() => {
      reads += 1;
      return reads === 1
        ? chain({ data: stored, error: null })
        : chain({ data: null, error: { message: "write failed" } });
    });

    // Act + Assert
    await expect(setBranchListing("t1", "branch-a", "adobo", isListed)).rejects.toThrow(
      "write failed",
    );
  });

  it("throws when the branch's current row cannot be read", async () => {
    // Arrange: treating an unreadable row as absent would write a fresh row of
    // defaults over the branch's price.
    from.mockImplementation(() => chain({ data: null, error: { message: "timeout" } }));

    // Act + Assert
    await expect(setBranchListing("t1", "branch-a", "adobo", false)).rejects.toThrow("timeout");
  });
});
