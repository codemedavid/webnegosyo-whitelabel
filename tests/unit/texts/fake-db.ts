/**
 * A tiny in-memory PostgREST stand-in for the Texts server tests: tables of
 * plain rows, the filters the engine uses, unique keys that raise 23505 (or
 * are skipped by upsert ignoreDuplicates), head counts and paging. It is not
 * Postgres — RLS and triggers are probed against the real database — but it
 * makes idempotency and "affected rows" assertions honest.
 */

type Row = Record<string, unknown>
type Predicate = (row: Row) => boolean

export interface UniqueKey {
  columns: string[]
  where?: Predicate
}

export interface FakeDbOptions {
  unique?: Record<string, UniqueKey[]>
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>
  /** Runs before an insert/upsert/update/delete executes; may mutate `tables` (races) or throw (failures). */
  beforeWrite?: (event: { table: string; mode: string; rows: Row[]; patch: Row; tables: Record<string, Row[]> }) => void
  /** Tables whose reads fail with this message. */
  readErrors?: Record<string, string>
  /** Column defaults applied on insert (like the DB's). Defaults to TEXTS_DEFAULTS. */
  defaults?: Record<string, Row>
}

/** The DB defaults the engine relies on. */
export const TEXTS_DEFAULTS: Record<string, Row> = { sms_outbox: { status: 'queued' } }

let idCounter = 0
export const nextId = (): string => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`

function parseValue(raw: string): unknown {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
}

function compare(a: unknown, b: unknown): number {
  return String(a ?? '') < String(b ?? '') ? -1 : String(a ?? '') > String(b ?? '') ? 1 : 0
}

/** `col.op.value` / `and(a,b)` terms of a PostgREST `or=(…)`, split at top-level commas. */
function splitTop(expr: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of expr) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += char
  }
  return current ? [...parts, current] : parts
}

function termPredicate(term: string): Predicate {
  if (term.startsWith('and(')) {
    const inner = splitTop(term.slice(4, -1)).map(termPredicate)
    return (row) => inner.every((p) => p(row))
  }
  const [column, op, ...rest] = term.split('.')
  const value = rest.join('.')
  if (op === 'in') {
    const list = value.replace(/^\(|\)$/g, '').split(',')
    return (row) => list.includes(String(row[column]))
  }
  return opPredicate(column, op, parseValue(value))
}

function opPredicate(column: string, op: string, value: unknown): Predicate {
  switch (op) {
    case 'eq': return (row) => row[column] === value
    case 'neq': return (row) => row[column] !== value && row[column] !== null && row[column] !== undefined
    case 'is': return (row) => (row[column] ?? null) === value
    case 'gt': return (row) => row[column] != null && compare(row[column], value) > 0
    case 'gte': return (row) => row[column] != null && compare(row[column], value) >= 0
    case 'lt': return (row) => row[column] != null && compare(row[column], value) < 0
    case 'lte': return (row) => row[column] != null && compare(row[column], value) <= 0
    default: throw new Error(`fake-db: unsupported op ${op}`)
  }
}

export interface FakeDb {
  client: never
  tables: Record<string, Row[]>
  calls: Array<{ table: string; op: string; args: unknown[] }>
}

export function createFakeDb(seed: Record<string, Row[]> = {}, options: FakeDbOptions = {}): FakeDb {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]))
  const calls: FakeDb['calls'] = []

  function conflicts(table: string, row: Row): Row | undefined {
    for (const key of options.unique?.[table] ?? []) {
      if (key.where && !key.where(row)) continue
      const hit = (tables[table] ?? []).find((other) => other !== row && (!key.where || key.where(other))
        && key.columns.every((c) => other[c] === row[c]))
      if (hit) return hit
    }
    return undefined
  }

  function builder(table: string) {
    const filters: Predicate[] = []
    const orders: Array<{ column: string; ascending: boolean }> = []
    let mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
    let payload: Row[] = []
    let patch: Row = {}
    let isHead = false
    let wantsCount = false
    let ignoreDuplicates = false
    let window: [number, number] | null = null
    let single: 'one' | 'maybe' | null = null
    const record = (op: string, args: unknown[]) => calls.push({ table, op, args })

    const api: Record<string, unknown> = {
      select(_columns?: string, opts?: { count?: string; head?: boolean }) {
        record('select', [_columns, opts])
        isHead = opts?.head === true
        wantsCount = opts?.count === 'exact'
        return api
      },
      insert(rows: Row | Row[]) { record('insert', [rows]); mode = 'insert'; payload = [rows].flat(); return api },
      upsert(rows: Row | Row[], opts?: { ignoreDuplicates?: boolean }) {
        record('upsert', [rows, opts]); mode = 'upsert'; payload = [rows].flat(); ignoreDuplicates = opts?.ignoreDuplicates === true; return api
      },
      update(values: Row) { record('update', [values]); mode = 'update'; patch = values; return api },
      delete() { record('delete', []); mode = 'delete'; return api },
      eq(c: string, v: unknown) { record('eq', [c, v]); filters.push(opPredicate(c, 'eq', v)); return api },
      neq(c: string, v: unknown) { record('neq', [c, v]); filters.push(opPredicate(c, 'neq', v)); return api },
      gt(c: string, v: unknown) { record('gt', [c, v]); filters.push(opPredicate(c, 'gt', v)); return api },
      gte(c: string, v: unknown) { filters.push(opPredicate(c, 'gte', v)); return api },
      lt(c: string, v: unknown) { filters.push(opPredicate(c, 'lt', v)); return api },
      lte(c: string, v: unknown) { filters.push(opPredicate(c, 'lte', v)); return api },
      is(c: string, v: unknown) { filters.push(opPredicate(c, 'is', v)); return api },
      in(c: string, list: unknown[]) { record('in', [c, list]); filters.push((row) => list.includes(row[c])); return api },
      not(c: string, op: string, v: unknown) {
        const inner = op === 'in' ? termPredicate(`${c}.in.${String(v)}`) : opPredicate(c, op, v)
        filters.push((row) => !inner(row)); return api
      },
      or(expr: string) { record('or', [expr]); const terms = splitTop(expr).map(termPredicate); filters.push((row) => terms.some((p) => p(row))); return api },
      order(column: string, opts?: { ascending?: boolean }) { orders.push({ column, ascending: opts?.ascending !== false }); return api },
      range(from: number, to: number) { record('range', [from, to]); window = [from, to]; return api },
      limit(n: number) { record('limit', [n]); window = [0, n - 1]; return api },
      maybeSingle() { single = 'maybe'; return api },
      single() { single = 'one'; return api },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(execute).then(resolve, reject)
      },
    }

    function matching(): Row[] {
      const rows = (tables[table] ?? []).filter((row) => filters.every((p) => p(row)))
      const sorted = [...rows].sort((a, b) => {
        for (const { column, ascending } of orders) {
          const diff = compare(a[column], b[column])
          if (diff !== 0) return ascending ? diff : -diff
        }
        return 0
      })
      return window ? sorted.slice(window[0], window[1] + 1) : sorted
    }

    function write(): { rows: Row[]; error: { code: string; message: string } | null } {
      tables[table] = tables[table] ?? []
      const written: Row[] = []
      for (const raw of payload) {
        const row = { id: nextId(), created_at: new Date().toISOString(), ...(options.defaults ?? TEXTS_DEFAULTS)[table], ...raw }
        if (conflicts(table, row)) {
          if (mode === 'upsert' && ignoreDuplicates) continue
          return { rows: written, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        }
        tables[table].push(row)
        written.push(row)
      }
      return { rows: written, error: null }
    }

    function execute() {
      if (mode !== 'select') options.beforeWrite?.({ table, mode, rows: payload, patch, tables })
      if (mode === 'select' && options.readErrors?.[table]) return { data: null, error: { code: 'XX000', message: options.readErrors[table] }, count: null }
      if (mode === 'insert' || mode === 'upsert') {
        const { rows, error } = write()
        return finish(error ? [] : rows, error)
      }
      const targets = (tables[table] ?? []).filter((row) => filters.every((p) => p(row)))
      if (mode === 'update') targets.forEach((row) => Object.assign(row, patch))
      if (mode === 'delete') tables[table] = (tables[table] ?? []).filter((row) => !targets.includes(row))
      return finish(mode === 'select' ? matching() : targets, null)
    }

    function finish(rows: Row[], error: { code: string; message: string } | null) {
      const copies = rows.map((row) => ({ ...row }))
      if (error) return { data: null, error, count: null }
      if (single === 'one') return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } }
      if (single === 'maybe') return { data: copies[0] ?? null, error: null }
      return { data: isHead ? null : copies, error: null, count: wantsCount ? copies.length : null }
    }

    return api
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ table: `rpc:${name}`, op: 'rpc', args: [args] })
      const handler = options.rpc?.[name]
      return handler ? { data: handler(args), error: null } : { data: null, error: { message: `no rpc ${name}` } }
    },
  }
  return { client: client as never, tables, calls }
}

/** The unique keys the Texts engine leans on. */
export const TEXTS_UNIQUE: Record<string, UniqueKey[]> = {
  sms_outbox: [{ columns: ['tenant_id', 'family', 'customer_id', 'occurrence_key'] }],
  sms_campaign_runs: [
    { columns: ['campaign_id', 'due_at'] },
    { columns: ['campaign_id'], where: (row) => row.delivery === 'server' && (row.status === 'pending' || row.status === 'running') },
  ],
}
