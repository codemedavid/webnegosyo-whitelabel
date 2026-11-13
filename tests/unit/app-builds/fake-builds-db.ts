/**
 * An in-memory `tenant_apps` + `tenant_app_builds` behind the slice of the
 * supabase-js builder `src/lib/app-builds/service.ts` uses. It enforces what
 * the migration enforces (20261113120000, also run for real over PGlite in
 * tests/sql/run-tenant-app-builds.cjs): one open build per app + platform,
 * a unique EAS id, the forward-only status trigger (23514), so the service is
 * tested against the same refusals the platform gives.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
interface PgError {
  code: string
  message: string
}

const RANK: Record<string, number> = { queued: 0, preparing: 1, building: 2, finished: 3, errored: 3, cancelled: 3 }
const OPEN = new Set(['queued', 'preparing', 'building'])

export interface FakeBuildsDb {
  client: SupabaseClient<Database>
  apps: Row[]
  builds: Row[]
  /** Clock the fake stamps updated_at with. */
  now: () => string
}

function builder(db: FakeBuildsDb, table: string) {
  const filters: Filter[] = []
  let mode: 'select' | 'update' | 'insert' = 'select'
  let patch: Row = {}
  let insertRow: Row | null = null
  let returning = true
  let single: 'one' | 'maybe' | null = null
  let limit = Infinity
  let order: { column: string; ascending: boolean } | null = null

  const rows = () => (table === 'tenant_apps' ? db.apps : db.builds)

  const run = (): { data: unknown; error: PgError | null } => {
    if (mode === 'insert') {
      const row: Row = {
        status: 'queued',
        submit_status: 'none',
        eas_build_id: null,
        app_version: null,
        build_number: null,
        artifact_url: null,
        error: null,
        finished_at: null,
        created_at: db.now(),
        updated_at: db.now(),
        ...insertRow,
      }
      if (!db.apps.some((app) => app.tenant_id === row.tenant_id)) return { data: null, error: { code: '23503', message: 'violates foreign key' } }
      if (db.builds.some((b) => b.tenant_id === row.tenant_id && b.platform === row.platform && OPEN.has(b.status as string))) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "tenant_app_builds_one_open"' } }
      }
      db.builds.push(row)
      return { data: single ? row : [row], error: null }
    }

    let matched = rows().filter((row) => filters.every((filter) => filter(row)))
    if (mode === 'update') {
      for (const row of matched) {
        const next = { ...row, ...patch }
        if (next.status !== row.status && (RANK[next.status as string] < RANK[row.status as string] || RANK[row.status as string] === 3)) {
          return { data: null, error: { code: '23514', message: 'cannot move' } }
        }
        if (row.eas_build_id !== null && next.eas_build_id !== row.eas_build_id) return { data: null, error: { code: '23514', message: 'already has its EAS build' } }
        if (next.eas_build_id !== null && db.builds.some((b) => b !== row && b.eas_build_id === next.eas_build_id)) {
          return { data: null, error: { code: '23505', message: 'duplicate eas_build_id' } }
        }
      }
      for (const row of matched) {
        const wasOpen = OPEN.has(row.status as string)
        Object.assign(row, patch, { updated_at: db.now() })
        if (wasOpen && !OPEN.has(row.status as string)) row.finished_at = db.now()
      }
      if (!returning) return { data: null, error: null }
    }
    if (order) {
      const { column, ascending } = order
      matched = [...matched].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1))
    }
    matched = matched.slice(0, limit)
    if (single === 'one') return matched.length === 1 ? { data: matched[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } }
    if (single === 'maybe') return { data: matched[0] ?? null, error: null }
    return { data: matched, error: null }
  }

  const chain = {
    select() {
      if (mode === 'select') returning = true
      returning = true
      return chain
    },
    insert(row: Row) {
      mode = 'insert'
      insertRow = row
      return chain
    },
    update(values: Row) {
      mode = 'update'
      patch = values
      returning = false
      return chain
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value)
      return chain
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]))
      return chain
    },
    is(column: string, value: null) {
      filters.push((row) => row[column] === value)
      return chain
    },
    or(expression: string) {
      const parts = expression.split(',').map((part) => {
        const [column, op, ...rest] = part.split('.')
        if (op !== 'eq') throw new Error(`fake or() only knows eq: ${part}`)
        return { column, value: rest.join('.') }
      })
      filters.push((row) => parts.some(({ column, value }) => row[column] === value))
      return chain
    },
    order(column: string, options: { ascending?: boolean } = {}) {
      order = { column, ascending: options.ascending ?? true }
      return chain
    },
    limit(count: number) {
      limit = count
      return chain
    },
    single() {
      single = 'one'
      return chain
    },
    maybeSingle() {
      single = 'maybe'
      return chain
    },
    then<T>(resolve: (value: { data: unknown; error: PgError | null }) => T, reject?: (reason: unknown) => T) {
      try {
        return Promise.resolve(resolve(run()))
      } catch (error) {
        return reject ? Promise.resolve(reject(error)) : Promise.reject(error)
      }
    },
  }
  return chain
}

export function createFakeBuildsDb(apps: Row[] = []): FakeBuildsDb {
  let tick = Date.parse('2026-11-13T12:00:00Z')
  const db: FakeBuildsDb = {
    apps,
    builds: [],
    now: () => new Date((tick += 1000)).toISOString(),
    client: null as unknown as SupabaseClient<Database>,
  }
  db.client = { from: (table: string) => builder(db, table) } as unknown as SupabaseClient<Database>
  return db
}
