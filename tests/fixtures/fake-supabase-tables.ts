import type { SupabaseClient } from '@supabase/supabase-js'

export type FakeRow = Record<string, unknown>

/**
 * An in-memory stand-in for the service-role client: enough of the builder to
 * run real repository queries, so a column the code forgets to select shows up
 * as a missing field rather than passing silently. `or()` is accepted and
 * ignored — seed only rows the filter would keep.
 */
export function fakeSupabaseTables(
  tables: Record<string, FakeRow[]>,
  failures: Record<string, string> = {}
) {
  const seen: string[] = []

  function build(table: string) {
    let rows = [...(tables[table] ?? [])]
    let selected: string[] | null = null

    const query = {
      select(columns: string) {
        selected = columns.split(',').map((column) => column.trim())
        return query
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value)
        return query
      },
      in(column: string, values: readonly unknown[]) {
        rows = rows.filter((row) => values.includes(row[column] as never))
        return query
      },
      or() {
        return query
      },
      order(column: string, options?: { ascending?: boolean }) {
        const ascending = options?.ascending !== false
        rows = [...rows].sort((a, b) => {
          const left = String(a[column] ?? '')
          const right = String(b[column] ?? '')
          return ascending ? left.localeCompare(right) : right.localeCompare(left)
        })
        return query
      },
      range(from: number, to: number) {
        rows = rows.slice(from, to + 1)
        return settle()
      },
      limit(count: number) {
        rows = rows.slice(0, count)
        return settle()
      },
      async maybeSingle() {
        const result = await settle()
        const data = result.data as FakeRow[] | null
        return { data: Array.isArray(data) ? data[0] ?? null : data, error: result.error }
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        settle().then(resolve, reject),
    }

    async function settle() {
      seen.push(table)
      if (failures[table]) {
        return { data: null as FakeRow[] | null, error: { message: failures[table] } as { message: string } | null }
      }
      const projected = selected
        ? rows.map((row) =>
            Object.fromEntries(selected!.filter((column) => column in row).map((column) => [column, row[column]]))
          )
        : rows
      return { data: projected as FakeRow[] | null, error: null as { message: string } | null }
    }

    return query
  }

  return {
    client: { from: (table: string) => build(table) } as unknown as SupabaseClient,
    seen,
  }
}
