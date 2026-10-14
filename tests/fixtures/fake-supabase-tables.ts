import type { SupabaseClient } from '@supabase/supabase-js'

export type FakeRow = Record<string, unknown>

/**
 * PostgREST's `max-rows` on the platform project: one response never carries
 * more rows than this, whatever range was asked for, and says nothing about
 * the rest. A reader that does not page sums a truncated window silently.
 */
export const PLATFORM_MAX_ROWS = 1000

export interface FakeSupabaseOptions {
  /** Rows per response. Defaults to the platform's cap. */
  maxRows?: number
}

/** One settled request, for tests that count pages or check their windows. */
export interface FakeRequest {
  table: string
  from: number
  to: number | null
  returned: number
}

interface SelectOptions {
  count?: 'exact' | 'planned' | 'estimated'
  head?: boolean
}

interface Ordering {
  column: string
  ascending: boolean
  nullsFirst: boolean
}

type Predicate = (row: FakeRow) => boolean

/** Numbers compare as numbers; everything else (ISO instants included) as text. */
function compare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right))
}

function isNullish(value: unknown): boolean {
  return value === null || value === undefined
}

/** PostgREST list syntax: `(a,b,"c d")`. */
function parseList(list: string): string[] {
  return list
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((value) => value.trim().replace(/^"|"$/g, ''))
    .filter((value) => value.length > 0)
}

function negatable(column: string, operator: string, value: unknown): Predicate {
  if (operator === 'in' && typeof value === 'string') {
    const values = parseList(value)
    return (row) => values.includes(String(row[column]))
  }
  if (operator === 'is' && value === null) return (row) => isNullish(row[column])
  if (operator === 'eq') return (row) => row[column] === value
  throw new Error(`fakeSupabaseTables: not(${column}, ${operator}) is not modelled; add it before relying on it`)
}

function sortRows(rows: readonly FakeRow[], orderings: readonly Ordering[]): FakeRow[] {
  return [...rows].sort((a, b) => {
    for (const { column, ascending, nullsFirst } of orderings) {
      const left = a[column]
      const right = b[column]
      if (isNullish(left) || isNullish(right)) {
        if (isNullish(left) && isNullish(right)) continue
        return isNullish(left) === nullsFirst ? -1 : 1
      }
      const order = compare(left, right)
      if (order !== 0) return ascending ? order : -order
    }
    return 0
  })
}

/**
 * An in-memory stand-in for a Supabase client: enough of the query builder to
 * run real repository and report readers.
 *
 * - Every response is capped at `maxRows` (default: the platform's 1000), so a
 *   reader that forgets to page fails here as it fails in production.
 * - `order`, `range` and `limit` apply when the query settles, in PostgREST's
 *   order (filter → sort → window → cap), whatever order they were chained in.
 * - Only selected columns come back, so a column the code forgets to select
 *   shows up as a missing field rather than passing silently.
 * - `or()` is accepted and ignored: seed only rows the filter would keep. A
 *   `not()` operator that is not modelled throws instead of matching nothing.
 */
export function fakeSupabaseTables(
  /** Seeded rows per table. Typed rows (interfaces) are accepted as they are. */
  tables: Record<string, ReadonlyArray<object>>,
  failures: Record<string, string> = {},
  { maxRows = PLATFORM_MAX_ROWS }: FakeSupabaseOptions = {},
) {
  const seen: string[] = []
  const requests: FakeRequest[] = []

  function build(table: string) {
    const predicates: Predicate[] = []
    const orderings: Ordering[] = []
    let selected: string[] | null = null
    let selectOptions: SelectOptions = {}
    let window: { from: number; to: number | null } = { from: 0, to: null }

    const where = (predicate: Predicate) => {
      predicates.push(predicate)
      return query
    }

    const query = {
      select(columns = '*', options: SelectOptions = {}) {
        const list = columns.split(',').map((column) => column.trim())
        selected = list.includes('*') ? null : list
        selectOptions = options
        return query
      },
      eq: (column: string, value: unknown) => where((row) => row[column] === value),
      neq: (column: string, value: unknown) => where((row) => row[column] !== value),
      gt: (column: string, value: unknown) => where((row) => !isNullish(row[column]) && compare(row[column], value) > 0),
      gte: (column: string, value: unknown) => where((row) => !isNullish(row[column]) && compare(row[column], value) >= 0),
      lt: (column: string, value: unknown) => where((row) => !isNullish(row[column]) && compare(row[column], value) < 0),
      lte: (column: string, value: unknown) => where((row) => !isNullish(row[column]) && compare(row[column], value) <= 0),
      in: (column: string, values: readonly unknown[]) => where((row) => values.includes(row[column] as never)),
      is: (column: string, value: null | boolean) =>
        where((row) => (value === null ? isNullish(row[column]) : row[column] === value)),
      not(column: string, operator: string, value: unknown) {
        const matches = negatable(column, operator, value)
        return where((row) => !matches(row))
      },
      or() {
        return query
      },
      order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
        const ascending = options.ascending !== false
        orderings.push({ column, ascending, nullsFirst: options.nullsFirst ?? !ascending })
        return query
      },
      range(from: number, to: number) {
        window = { from, to }
        return query
      },
      limit(count: number) {
        window = { from: window.from, to: window.from + count - 1 }
        return query
      },
      async maybeSingle() {
        const result = await settle()
        return { ...result, data: result.data?.[0] ?? null }
      },
      async single() {
        const result = await settle()
        if (result.error) return { ...result, data: null }
        if (result.data?.length !== 1) {
          return { data: null, error: { message: `JSON object requested, ${result.data?.length ?? 0} rows returned` }, count: null }
        }
        return { ...result, data: result.data[0] }
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
    }

    async function settle() {
      seen.push(table)
      if (failures[table]) {
        requests.push({ table, ...window, returned: 0 })
        return { data: null as FakeRow[] | null, error: { message: failures[table] } as { message: string } | null, count: null as number | null }
      }

      const matching = sortRows(
        ((tables[table] ?? []) as ReadonlyArray<FakeRow>).filter((row) => predicates.every((predicate) => predicate(row))),
        orderings,
      )
      const asked = window.to === null ? Infinity : window.to - window.from + 1
      const page = matching.slice(window.from, window.from + Math.min(asked, maxRows))
      const projected = page.map((row) =>
        selected === null
          ? { ...row }
          : Object.fromEntries(selected.filter((column) => column in row).map((column) => [column, row[column]])),
      )
      requests.push({ table, ...window, returned: selectOptions.head ? 0 : projected.length })

      return {
        data: (selectOptions.head ? null : projected) as FakeRow[] | null,
        error: null as { message: string } | null,
        count: selectOptions.count ? matching.length : null,
      }
    }

    return query
  }

  return {
    client: { from: (table: string) => build(table) } as unknown as SupabaseClient,
    seen,
    requests,
  }
}
