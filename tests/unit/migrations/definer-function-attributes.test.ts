/**
 * `CREATE OR REPLACE FUNCTION` replaces the whole definition, including the
 * attributes a previous migration added on purpose: `SECURITY DEFINER`, a
 * pinned `search_path`, and any in-function authorization guard. Restating a
 * function body to change one line silently drops them.
 *
 * That happened to `initialize_order_types_for_tenant`: 20260910150000 added a
 * tenant guard + pinned search_path, then 20260922090000 re-created the
 * function to add a dine-in phone field and both were gone in production —
 * any signed-in account could seed rows into another tenant again.
 *
 * This replays every migration in order and asserts that, for each function,
 * an attribute once set is still in effect after the LAST migration that
 * touches it. It runs without a database; the live state is probed separately
 * (pg_proc.proconfig / prosecdef).
 */

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

interface FunctionState {
  isDefiner: boolean
  hasSearchPath: boolean
  everDefiner: boolean
  everSearchPath: boolean
  lastDefinedIn: string
  lastBody: string
}

const CREATE_FUNCTION = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi
const ALTER_SEARCH_PATH = /alter\s+function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\([^)]*\)\s*set\s+search_path/gi
const ALTER_SECURITY = /alter\s+function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\([^)]*\)\s*security\s+(definer|invoker)/gi
const DROP_FUNCTION = /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi

/** Executable SQL only: a comment quoting an attribute must not count as setting it. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** The full CREATE FUNCTION statement starting at `start`, through its dollar-quoted body. */
function statementAt(sql: string, start: number): string {
  const rest = sql.slice(start)
  const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(rest)
  if (!tag) return rest.slice(0, rest.indexOf(';') + 1)
  const bodyStart = tag.index + tag[0].length
  const bodyEnd = rest.indexOf(tag[1], bodyStart)
  const end = rest.indexOf(';', bodyEnd + tag[1].length)
  return rest.slice(0, end === -1 ? undefined : end + 1)
}

/** Header + trailing attributes, without the body (a body may mention "security definer" in a string). */
function attributesOf(statement: string): string {
  const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(statement)
  if (!tag) return statement
  const bodyStart = tag.index + tag[0].length
  const bodyEnd = statement.indexOf(tag[1], bodyStart)
  return statement.slice(0, tag.index) + statement.slice(bodyEnd + tag[1].length)
}

interface Event {
  index: number
  apply: (states: Map<string, FunctionState>, file: string) => void
}

function eventsIn(sql: string): Event[] {
  const events: Event[] = []
  for (const m of sql.matchAll(CREATE_FUNCTION)) {
    const name = m[1].toLowerCase()
    const statement = statementAt(sql, m.index ?? 0)
    const attrs = attributesOf(statement).toLowerCase()
    events.push({
      index: m.index ?? 0,
      apply: (states, file) => {
        const prev = states.get(name)
        const isDefiner = /\bsecurity\s+definer\b/.test(attrs)
        const hasSearchPath = /\bset\s+search_path\b/.test(attrs)
        states.set(name, {
          isDefiner,
          hasSearchPath,
          everDefiner: (prev?.everDefiner ?? false) || isDefiner,
          everSearchPath: (prev?.everSearchPath ?? false) || hasSearchPath,
          lastDefinedIn: file,
          lastBody: statement,
        })
      },
    })
  }
  for (const m of sql.matchAll(ALTER_SEARCH_PATH)) {
    const name = m[1].toLowerCase()
    events.push({
      index: m.index ?? 0,
      apply: (states) => {
        const prev = states.get(name)
        if (prev) states.set(name, { ...prev, hasSearchPath: true, everSearchPath: true })
      },
    })
  }
  for (const m of sql.matchAll(ALTER_SECURITY)) {
    const name = m[1].toLowerCase()
    const isDefiner = m[2].toLowerCase() === 'definer'
    events.push({
      index: m.index ?? 0,
      apply: (states) => {
        const prev = states.get(name)
        // An explicit switch to INVOKER is a deliberate decision, so it resets history.
        if (prev) states.set(name, { ...prev, isDefiner, everDefiner: isDefiner })
      },
    })
  }
  for (const m of sql.matchAll(DROP_FUNCTION)) {
    const name = m[1].toLowerCase()
    events.push({ index: m.index ?? 0, apply: (states) => void states.delete(name) })
  }
  return events.sort((a, b) => a.index - b.index)
}

function replayMigrations(): Map<string, FunctionState> {
  const states = new Map<string, FunctionState>()
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    for (const event of eventsIn(sql)) event.apply(states, file)
  }
  return states
}

describe('migration history keeps SECURITY DEFINER function attributes', () => {
  const states = replayMigrations()

  it('finds function definitions to check', () => {
    expect(states.size).toBeGreaterThan(20)
  })

  it('never loses a pinned search_path through a later CREATE OR REPLACE', () => {
    const lost = [...states.entries()]
      .filter(([, s]) => s.everSearchPath && !s.hasSearchPath)
      .map(([name, s]) => `${name} (last defined in ${s.lastDefinedIn})`)
    expect(lost).toEqual([])
  })

  it('never loses SECURITY DEFINER through a later CREATE OR REPLACE', () => {
    const lost = [...states.entries()]
      .filter(([, s]) => s.everDefiner && !s.isDefiner)
      .map(([name, s]) => `${name} (last defined in ${s.lastDefinedIn})`)
    expect(lost).toEqual([])
  })

  it('keeps the tenant guard on initialize_order_types_for_tenant', () => {
    const state = states.get('initialize_order_types_for_tenant')
    expect(state).toBeDefined()
    expect(state?.isDefiner).toBe(true)
    expect(state?.hasSearchPath).toBe(true)
    expect(state?.lastBody).toMatch(/auth\.uid\(\)\s+is\s+not\s+null\s+and\s+not\s+exists/i)
    expect(state?.lastBody).toContain('au.tenant_id = tenant_uuid')
    // The 20260922 dine-in phone field must survive the restore.
    expect(state?.lastBody).toMatch(/dine_in_id,\s*'customer_phone'/)
  })
})
