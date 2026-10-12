/**
 * Reading past PostgREST's 1000-row cap, with a ceiling.
 *
 * Pages are read one after another until a short page (the end) or the
 * ceiling. Hitting the ceiling is reported, never hidden: totals over a
 * truncated window are not the month's totals, and the screen must say so.
 */

export interface PageResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface PagedRead<T> {
  rows: T[];
  isTruncated: boolean;
}

export interface PagingOptions {
  pageSize: number;
  maxRows: number;
}

/** `fetchPage(from, to)` reads the inclusive range, like `.range(from, to)`. */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  { pageSize, maxRows }: PagingOptions,
): Promise<PagedRead<T>> {
  const pages: T[][] = [];
  let read = 0;
  while (read < maxRows) {
    const size = Math.min(pageSize, maxRows - read);
    const { data, error } = await fetchPage(read, read + size - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    pages.push(page);
    read += page.length;
    if (page.length < size) return { rows: pages.flat(), isTruncated: false };
  }
  // A full last page at the ceiling: there may be more, so ask for one row past it.
  const { data, error } = await fetchPage(read, read);
  if (error) throw new Error(error.message);
  return { rows: pages.flat(), isTruncated: (data ?? []).length > 0 };
}
