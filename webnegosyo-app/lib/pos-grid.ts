/**
 * Rows for the register's product grid.
 *
 * The grid is virtualised by ROW so every column keeps the same width; the
 * chunking runs on every keystroke of the search box, so it is a single pass
 * with one allocation per row rather than a copy-per-item reduce.
 */

export function chunkRows<T>(items: readonly T[], columns: number): T[][] {
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error(`chunkRows: columns must be a positive integer, got ${columns}`);
  }

  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += columns) {
    rows.push(items.slice(start, start + columns));
  }
  return rows;
}
