/**
 * Which category the menu is "in": the last section header at or above the
 * first visible row. `headerIndices` are the rows that are headers, ascending.
 */
export function sectionForIndex(firstVisibleIndex: number, headerIndices: readonly number[]): number {
  let section = 0
  headerIndices.forEach((headerIndex, index) => {
    if (headerIndex <= firstVisibleIndex) section = index
  })
  return section
}
