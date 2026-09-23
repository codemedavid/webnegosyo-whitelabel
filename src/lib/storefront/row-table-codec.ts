/**
 * A lossless, JSON-safe column-table encoding for homogeneous row lists.
 *
 * `[{ id, name, ... }, ...]` becomes `{ columns: ['id', 'name', ...], rows:
 * [[...], ...] }`. PostgREST rows repeat every column name in every row; for a
 * large menu those names were over half of the cached snapshot, which is what
 * pushed it past Next's 2 MB data-cache entry limit. This is a storage format
 * only — callers decode back to plain objects before anything renders them.
 */

export interface RowTable {
  columns: string[]
  /** One array of values per row, aligned with `columns`. */
  rows: unknown[][]
  /** Per row, the column indexes the row did not have (omitted when none). */
  absent?: Record<number, number[]>
}

export function encodeRowTable<T extends object>(rows: readonly T[]): RowTable {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const absent: Record<number, number[]> = {}

  const encoded = rows.map((row, rowIndex) => {
    const record = row as Record<string, unknown>
    return columns.map((column, columnIndex) => {
      if (column in record) return record[column] ?? null
      absent[rowIndex] = [...(absent[rowIndex] ?? []), columnIndex]
      return null
    })
  })

  return Object.keys(absent).length > 0 ? { columns, rows: encoded, absent } : { columns, rows: encoded }
}

export function decodeRowTable<T>(table: RowTable): T[] {
  const { columns, absent = {} } = table
  return table.rows.map((values, rowIndex) => {
    const missing = absent[rowIndex] ?? []
    const entries = columns
      .map((column, columnIndex) => [column, values[columnIndex], columnIndex] as const)
      .filter(([, , columnIndex]) => !missing.includes(columnIndex))
      .map(([column, value]) => [column, value] as const)
    return Object.fromEntries(entries) as T
  })
}
