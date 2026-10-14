/**
 * The rows behind `CollapsingHeaderList`: a big header that scrolls away and a
 * filter toolbar that docks under the status bar once it has.
 *
 * The toolbar is a ROW of the list (not a view laid over it) so the native
 * sticky-header machinery docks it, pull-to-refresh still appears at the top,
 * and nothing has to be measured to lay the list out. The header is the
 * list's `ListHeaderComponent` (child 0), so the toolbar is child 1.
 */

export const TOOLBAR_ROW = { kind: "toolbar" } as const;
export const EMPTY_ROW = { kind: "empty" } as const;

export interface CollapsingItemRow<T> {
  kind: "item";
  item: T;
  /** The item's index in the caller's own data, for its renderItem. */
  index: number;
}

export type CollapsingRow<T> = typeof TOOLBAR_ROW | typeof EMPTY_ROW | CollapsingItemRow<T>;

/** Child indices, counted with the list header as child 0. */
export const STICKY_TOOLBAR_INDICES: number[] = [1];

/**
 * Sub-pixel offsets from a snap can land a hair short of the header's height;
 * that still reads as docked.
 */
const COLLAPSE_SLACK_PX = 1;

export function buildCollapsingRows<T>(data: readonly T[]): CollapsingRow<T>[] {
  if (data.length === 0) return [TOOLBAR_ROW, EMPTY_ROW];
  return [TOOLBAR_ROW, ...data.map((item, index) => ({ kind: "item" as const, item, index }))];
}

export function collapsingRowKey<T>(
  row: CollapsingRow<T>,
  keyOf: (item: T, index: number) => string,
): string {
  if (row.kind === "toolbar") return "__toolbar__";
  if (row.kind === "empty") return "__empty__";
  return `item:${keyOf(row.item, row.index)}`;
}

/** Whether the header has scrolled out and the toolbar is docked. */
export function isHeaderCollapsed(offsetY: number, headerHeight: number): boolean {
  if (headerHeight <= 0) return false;
  return offsetY >= headerHeight - COLLAPSE_SLACK_PX;
}

/**
 * Let go half-way through the header and the list settles fully open or fully
 * docked — never with a sliced title. Past the header it scrolls freely.
 */
export function snapOffsetsFor(headerHeight: number): number[] | undefined {
  return headerHeight > 0 ? [0, headerHeight] : undefined;
}

/**
 * A docked list whose filter just changed is showing the middle of a list that
 * no longer exists; put the first result under the toolbar instead.
 */
export function shouldRealignAfterFilter(offsetY: number, headerHeight: number): boolean {
  return headerHeight > 0 && offsetY > headerHeight;
}
