/**
 * Which orders make up today's Drawer.
 *
 * The screen reads one newest-first page of orders, shared with the shift
 * card. On a busy store that page can stop short of midnight, and every sale
 * it drops is money the till holds but the totals never see. These decide
 * when the page is enough and how a day read fills the gap. Pure.
 */

interface DatedOrder {
  _id: string;
  _creationTime: number;
}

/** Does a newest-first page already hold everything since `sinceMs`? */
export function pageReachesBack(
  page: readonly DatedOrder[],
  pageLimit: number,
  sinceMs: number,
): boolean {
  if (page.length < pageLimit) return true;
  return page.some((order) => order._creationTime < sinceMs);
}

/**
 * Orders created from `sinceMs` on, newest first.
 *
 * The page is the live read, so it wins for an order both reads hold; the day
 * read only supplies the older part of the day the page has dropped.
 */
export function ordersSince<T extends DatedOrder>(
  page: readonly T[],
  dayRead: readonly T[] | undefined,
  sinceMs: number,
): T[] {
  const inPage = new Set(page.map((order) => order._id));
  const dropped = (dayRead ?? []).filter((order) => !inPage.has(order._id));
  return [...page, ...dropped]
    .filter((order) => order._creationTime >= sinceMs)
    .sort((a, b) => b._creationTime - a._creationTime);
}

/** Ids of the orders the page does not hold — the only ledgers left to read. */
export function idsBeyondPage(page: readonly DatedOrder[], sales: readonly DatedOrder[]): string[] {
  const inPage = new Set(page.map((order) => order._id));
  return sales.filter((order) => !inPage.has(order._id)).map((order) => order._id);
}
