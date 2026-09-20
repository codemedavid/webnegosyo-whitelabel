/**
 * Narrowing the curated icon vocabulary down for the icon picker.
 *
 * Kept out of the sheet so the one rule worth stating plainly lives somewhere a
 * test can reach it: "All" is not a group, it is the absence of one. A label
 * this build does not recognise narrows to nothing rather than silently
 * widening back out to the whole catalog, which would look to the merchant like
 * their filter had been ignored.
 */
import {
  ALL_CURATED_ICONS,
  CURATED_ICON_GROUPS,
} from "./category-icon-catalog";

/** The pseudo-group that means "do not narrow by group at all". */
export const ALL_GROUP_LABEL = "All";

/** The chips the picker offers, in the order it offers them. */
export function iconGroupLabels(): readonly string[] {
  return [ALL_GROUP_LABEL, ...CURATED_ICON_GROUPS.map((group) => group.label)];
}

function iconsForGroup(groupLabel: string): readonly string[] {
  if (groupLabel === ALL_GROUP_LABEL) return ALL_CURATED_ICONS;

  return CURATED_ICON_GROUPS.find((group) => group.label === groupLabel)?.icons ?? [];
}

/**
 * The curated icons matching both the chosen group and the typed search.
 *
 * Always a fresh array: the catalog constants are shared by every screen that
 * draws a category, so handing one of them back to a caller that might sort or
 * splice it would corrupt the vocabulary itself.
 */
export function filterCuratedIcons(
  groupLabel: string,
  search: string,
): readonly string[] {
  const icons = iconsForGroup(groupLabel);
  const query = search.trim().toLowerCase();

  if (!query) return [...icons];

  return icons.filter((name) => name.includes(query));
}
