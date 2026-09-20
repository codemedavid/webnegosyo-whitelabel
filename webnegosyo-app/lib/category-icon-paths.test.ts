/**
 * The picker offers what the catalog lists; this file has to be able to draw
 * every one of those. A name in the catalog with no geometry here is a blank
 * tile the merchant can still select and save — the category then shows no
 * icon anywhere, and nothing about the save says why.
 */
import {
  ALL_CURATED_ICONS,
  CURATED_ICON_GROUPS,
  isKnownCategoryIcon,
  getLucideIconName,
  toLucideIconString,
} from "./category-icon-catalog";
import { CATEGORY_ICON_NODES, categoryIconNodes } from "./category-icon-paths";

const DRAWABLE_ELEMENTS = ["path", "circle", "rect", "line"];

describe("curated icon geometry", () => {
  it("can draw every icon the catalog offers", () => {
    const undrawable = ALL_CURATED_ICONS.filter((name) => !categoryIconNodes(name));
    expect(undrawable).toEqual([]);
  });

  it("carries no geometry the catalog does not offer", () => {
    const offered = new Set(ALL_CURATED_ICONS);
    expect(Object.keys(CATEGORY_ICON_NODES).filter((name) => !offered.has(name))).toEqual([]);
  });

  it("draws with primitives react-native-svg actually renders", () => {
    for (const [name, nodes] of Object.entries(CATEGORY_ICON_NODES)) {
      expect(nodes.length).toBeGreaterThan(0);
      for (const [element, attrs] of nodes) {
        expect(DRAWABLE_ELEMENTS).toContain(element);
        expect(Object.keys(attrs).length).toBeGreaterThan(0);
        // `key` is lucide's React hint, not an SVG attribute: passed through to
        // react-native-svg it is a silent no-op that bloats every icon.
        expect(attrs).not.toHaveProperty("key");
        expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it("resolves a stored `lucide:<name>` back to its geometry", () => {
    const stored = toLucideIconString("coffee");

    expect(isKnownCategoryIcon(stored)).toBe(true);
    expect(categoryIconNodes(getLucideIconName(stored))).toBeDefined();
  });

  it("has no geometry for an unknown name", () => {
    expect(categoryIconNodes("not-an-icon")).toBeUndefined();
  });
});

describe("curated icon groups", () => {
  it("lists every icon under at least one group", () => {
    const grouped = new Set(CURATED_ICON_GROUPS.flatMap((group) => group.icons));

    expect(ALL_CURATED_ICONS.every((name) => grouped.has(name))).toBe(true);
  });
});
