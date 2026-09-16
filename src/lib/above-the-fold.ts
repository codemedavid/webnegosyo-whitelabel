/**
 * Which menu cards sit above the fold.
 *
 * Every card image was lazy-loaded, including the one Lighthouse names as the
 * LCP element. The first few cards on the page load eagerly with high fetch
 * priority; everything after stays lazy. Pure, so every layout — grid,
 * grouped, mosaic, magazine, grid-focus — applies the same rule.
 */

/** Cards in the first viewport on a phone: two columns, two rows. */
export const ABOVE_THE_FOLD_CARD_COUNT = 4

export function isAboveTheFold(pageIndex: number): boolean {
  return pageIndex < ABOVE_THE_FOLD_CARD_COUNT
}

interface HasItems {
  items: readonly unknown[]
}

/**
 * A card's index in page order when the page is drawn as groups: the cards
 * of every earlier group, then its own position.
 */
export function pageIndexOf(
  groups: readonly HasItems[],
  groupIndex: number,
  itemIndex: number,
): number {
  const before = groups
    .slice(0, groupIndex)
    .reduce((count, group) => count + group.items.length, 0)
  return before + itemIndex
}
