/**
 * Narrowing the curated icon list down to what the merchant is looking for.
 *
 * Pure so the sheet itself stays presentational, and so the one rule that is
 * easy to get wrong — "All" is not a group, it is the absence of one — is
 * pinned by a test rather than by a conditional buried in JSX.
 */
import {
  ALL_GROUP_LABEL,
  iconGroupLabels,
  filterCuratedIcons,
} from "./category-icon-search";
import { ALL_CURATED_ICONS, CURATED_ICON_GROUPS } from "./category-icon-catalog";

describe("iconGroupLabels", () => {
  it("offers 'All' ahead of every curated group", () => {
    expect(iconGroupLabels()).toEqual([
      ALL_GROUP_LABEL,
      ...CURATED_ICON_GROUPS.map((group) => group.label),
    ]);
  });
});

describe("filterCuratedIcons", () => {
  it("returns every curated icon when nothing is narrowed", () => {
    expect(filterCuratedIcons(ALL_GROUP_LABEL, "")).toEqual(ALL_CURATED_ICONS);
  });

  it("returns only the icons of the chosen group", () => {
    const group = CURATED_ICON_GROUPS[0];

    expect(filterCuratedIcons(group.label, "")).toEqual(group.icons);
  });

  it("matches a search regardless of the case the merchant typed", () => {
    expect(filterCuratedIcons(ALL_GROUP_LABEL, "COFFEE")).toContain("coffee");
  });

  it("ignores the spaces around a search", () => {
    expect(filterCuratedIcons(ALL_GROUP_LABEL, "  coffee  ")).toContain("coffee");
  });

  it("searches inside the chosen group, not across the whole catalog", () => {
    const group = CURATED_ICON_GROUPS.find((g) => !g.icons.includes("coffee"));
    if (!group) throw new Error("expected a group without the coffee icon");

    expect(filterCuratedIcons(group.label, "coffee")).toEqual([]);
  });

  it("returns nothing for a group it has never heard of rather than the whole catalog", () => {
    expect(filterCuratedIcons("Not A Group", "")).toEqual([]);
  });

  it("returns an empty list when no icon matches, so the sheet can say so", () => {
    expect(filterCuratedIcons(ALL_GROUP_LABEL, "zzzz")).toEqual([]);
  });

  it("never hands back the catalog array itself for a caller to mutate", () => {
    const filtered = filterCuratedIcons(ALL_GROUP_LABEL, "coffee");

    expect(filtered).not.toBe(ALL_CURATED_ICONS);
  });
});
