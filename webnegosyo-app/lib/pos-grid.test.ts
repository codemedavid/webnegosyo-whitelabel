/**
 * Chunking the register's product list into fixed-width rows.
 *
 * The screen used to build rows with a reduce that copied every row on every
 * step — O(n²) on a menu with photos — and rebuilt it on each keystroke of the
 * search box. One pass, one allocation per row.
 */
import { chunkRows } from "./pos-grid";

describe("chunkRows", () => {
  it("returns no rows for no items", () => {
    expect(chunkRows([], 3)).toEqual([]);
  });

  it("fills rows to the column count and leaves the last one short", () => {
    expect(chunkRows(["a", "b", "c", "d", "e"], 3)).toEqual([["a", "b", "c"], ["d", "e"]]);
  });

  it("does not mutate its input", () => {
    const items = Object.freeze(["a", "b", "c", "d"]);
    expect(chunkRows(items, 2)).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("refuses a column count that cannot make rows", () => {
    expect(() => chunkRows(["a"], 0)).toThrow();
  });
});
