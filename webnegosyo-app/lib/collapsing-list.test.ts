import {
  EMPTY_ROW,
  STICKY_TOOLBAR_INDICES,
  TOOLBAR_ROW,
  buildCollapsingRows,
  collapsingRowKey,
  isHeaderCollapsed,
  shouldRealignAfterFilter,
  snapOffsetsFor,
} from "./collapsing-list";

describe("buildCollapsingRows", () => {
  it("puts the docked toolbar first, then every item with its own index", () => {
    // Arrange
    const data = ["a", "b"];

    // Act
    const rows = buildCollapsingRows(data);

    // Assert
    expect(rows).toEqual([
      TOOLBAR_ROW,
      { kind: "item", item: "a", index: 0 },
      { kind: "item", item: "b", index: 1 },
    ]);
  });

  it("keeps the toolbar and adds an empty row when there is nothing to list", () => {
    // Arrange + Act
    const rows = buildCollapsingRows([]);

    // Assert: the filters must stay reachable when they filtered everything out.
    expect(rows).toEqual([TOOLBAR_ROW, EMPTY_ROW]);
  });

  it("docks child 1, the row after the scroll-away header", () => {
    expect(STICKY_TOOLBAR_INDICES).toEqual([1]);
  });
});

describe("collapsingRowKey", () => {
  it("delegates item keys and never collides with the two fixed rows", () => {
    // Arrange
    const keyOf = (item: string) => item;

    // Act + Assert
    expect(collapsingRowKey(TOOLBAR_ROW, keyOf)).toBe("__toolbar__");
    expect(collapsingRowKey(EMPTY_ROW, keyOf)).toBe("__empty__");
    expect(collapsingRowKey({ kind: "item", item: "__toolbar__", index: 0 }, keyOf)).toBe(
      "item:__toolbar__",
    );
  });
});

describe("isHeaderCollapsed", () => {
  it("is never collapsed before the header has been measured", () => {
    expect(isHeaderCollapsed(500, 0)).toBe(false);
  });

  it("collapses once the header has scrolled out of view", () => {
    expect(isHeaderCollapsed(119, 180)).toBe(false);
    expect(isHeaderCollapsed(179.5, 180)).toBe(true);
    expect(isHeaderCollapsed(400, 180)).toBe(true);
  });

  it("is expanded at the top and while pulling to refresh", () => {
    expect(isHeaderCollapsed(0, 180)).toBe(false);
    expect(isHeaderCollapsed(-60, 180)).toBe(false);
  });
});

describe("snapOffsetsFor", () => {
  it("snaps between fully open and fully docked once measured", () => {
    expect(snapOffsetsFor(180)).toEqual([0, 180]);
  });

  it("does not snap before the header has a height", () => {
    expect(snapOffsetsFor(0)).toBeUndefined();
  });
});

describe("shouldRealignAfterFilter", () => {
  it("brings a docked list back to its first result", () => {
    expect(shouldRealignAfterFilter(900, 180)).toBe(true);
  });

  it("leaves the list alone while the header is still in view", () => {
    expect(shouldRealignAfterFilter(40, 180)).toBe(false);
    expect(shouldRealignAfterFilter(180, 180)).toBe(false);
    expect(shouldRealignAfterFilter(900, 0)).toBe(false);
  });
});
