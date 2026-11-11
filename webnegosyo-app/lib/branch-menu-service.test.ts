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
  ["select", "eq", "in", "order", "range", "limit", "upsert", "delete", "update", "insert"].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.maybeSingle = jest.fn(() => settled);
  builder.single = jest.fn(() => settled);
  builder.then = settled.then.bind(settled);
  return builder;
}

/**
 * A table that answers like the platform database: `.range(from, to)` is
 * honoured, and one response never carries more than 1,000 rows, whatever was
 * asked for. A read that does not page stops there and says nothing. (The same
 * stand-in as `products-branch.test.ts`: the web's `fake-supabase-tables`
 * fixture lives outside this project and its install.)
 */
const MAX_ROWS_PER_RESPONSE = 1000;

function cappedTable(rows: unknown[]) {
  const windows: [number, number][] = [];
  const orderedBy: string[] = [];
  const table = () => {
    let window = { from: 0, to: Number.POSITIVE_INFINITY };
    const builder: Record<string, unknown> = {};
    ["select", "eq"].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    builder.order = jest.fn((column: string) => {
      orderedBy.push(column);
      return builder;
    });
    builder.range = jest.fn((from: number, to: number) => {
      window = { from, to };
      windows.push([from, to]);
      return builder;
    });
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const end = Math.min(window.to + 1, window.from + MAX_ROWS_PER_RESPONSE);
      return Promise.resolve({ data: rows.slice(window.from, end), error: null }).then(resolve, reject);
    };
    return builder;
  };
  return { table, windows, orderedBy };
}

/** `count` branch differences, each a different dish at one of five branches. */
function manyOverrides(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...EXISTING,
    outlet_id: `branch-${index % 5}`,
    menu_item_id: `dish-${index}`,
  }));
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

  it("reads every difference past the first 1,000: an unread one would show the dish as carried", async () => {
    // Arrange
    const { table } = cappedTable(manyOverrides(2500));
    from.mockImplementation(table);

    // Act
    const rows = await listBranchMenuOverrides("t1");

    // Assert
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((row) => `${row.outlet_id}/${row.menu_item_id}`)).size).toBe(2500);
  });

  it("pages in a unique order (branch, then dish), one request for a small store and six for 5,000 rows", async () => {
    // Arrange
    const small = cappedTable(manyOverrides(40));
    from.mockImplementation(small.table);

    // Act
    await listBranchMenuOverrides("t1");

    // Assert
    expect(small.windows).toEqual([[0, 999]]);
    expect(small.orderedBy).toEqual(["outlet_id", "menu_item_id"]);

    // Arrange
    const large = cappedTable(manyOverrides(5000));
    from.mockImplementation(large.table);

    // Act
    await listBranchMenuOverrides("t1");

    // Assert
    expect(large.windows).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
      [5000, 5999],
    ]);
  });

  it("fails rather than answering with part of the rows past its ceiling", async () => {
    // Arrange
    from.mockImplementation(cappedTable(manyOverrides(20001)).table);

    // Act + Assert
    await expect(listBranchMenuOverrides("t1")).rejects.toThrow(/more than 20,000/);
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

  it.each([
    ["is still there: the database refused to remove it", [{ menu_item_id: "adobo" }], true],
    ["is gone: someone else already put the dish back", [], false],
  ])("after a removal that changed nothing, the row %s", async (_case, remaining, isRefused) => {
    // Arrange: the row reads as "not here", the delete changes zero rows with
    // no error (how row-level security refuses), then the look for the row.
    const answers = [
      { data: { ...EXISTING, is_listed: false, price: null }, error: null },
      { data: [], error: null },
      { data: remaining, error: null },
    ];
    from.mockImplementation(() => chain(answers.shift() ?? { data: null, error: null }));

    // Act
    const write = setBranchListing("t1", "branch-a", "adobo", true);

    // Assert
    if (isRefused) {
      await expect(write).rejects.toThrow("Nothing was changed. You may not have access to do this.");
    } else {
      await expect(write).resolves.toBeUndefined();
    }
  });

  it("throws when the branch's current row cannot be read", async () => {
    // Arrange: treating an unreadable row as absent would write a fresh row of
    // defaults over the branch's price.
    from.mockImplementation(() => chain({ data: null, error: { message: "timeout" } }));

    // Act + Assert
    await expect(setBranchListing("t1", "branch-a", "adobo", false)).rejects.toThrow("timeout");
  });
});
