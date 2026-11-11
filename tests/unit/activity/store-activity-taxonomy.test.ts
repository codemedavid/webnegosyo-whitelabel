import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_FLAGS,
  ACTIVITY_KINDS,
  FLAG_COPY,
  FLAG_THRESHOLDS,
  KINDS_BY_CATEGORY,
  ROUTINE_KINDS,
  SUBJECT_TYPES,
  categoryOfKind,
  isActivityFlag,
  isActivityKind,
  isRoutineKind,
} from '@/lib/activity/taxonomy'

/**
 * The vocabulary lives twice: the DB CHECKs and this TS mirror. The CHECKs and
 * vocabulary functions are redefined by later migrations (e.g. expenses,
 * 20261022120200), so each pattern is read from the NEWEST migration file that
 * contains it — what the database runs after every migration is applied. A kind
 * added to one side only fails here, not as a silently-refused insert.
 */
const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .reverse()
  .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))
const CONTRACT = readFileSync(join(process.cwd(), 'docs/plans/store-activity/contract.md'), 'utf8')

function quoted(list: string): string[] {
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

/** First capture group of `pattern` in the newest migration that matches it. */
function capture(pattern: RegExp): string {
  for (const migration of MIGRATIONS) {
    const match = migration.sql.match(pattern)
    if (match) return match[1]
  }
  throw new Error(`pattern not found in any migration: ${pattern}`)
}

function sqlKindsByCategory(): Record<string, string[]> {
  const body = capture(/create or replace function public\.store_activity_category_of[\s\S]*?select case([\s\S]*?)end\n\$\$/)
  const entries = [...body.matchAll(/when p_kind in \(([^)]*)\) then '(\w+)'/g)]
  return Object.fromEntries(entries.map((match) => [match[2], quoted(match[1])]))
}

describe('store activity taxonomy mirrors the migration', () => {
  it('has the same categories as store_activity_category_ck', () => {
    const sql = quoted(capture(/constraint store_activity_category_ck check \(category in \(([\s\S]*?)\)\)/))
    expect([...ACTIVITY_CATEGORIES]).toEqual(sql)
  })

  it('maps every kind to the same category as store_activity_category_of()', () => {
    const sql = sqlKindsByCategory()
    const ts = Object.fromEntries(ACTIVITY_CATEGORIES.map((category) => [category, [...KINDS_BY_CATEGORY[category]]]))
    expect(ts).toEqual(sql)
  })

  it('has the same routine kinds as store_activity_is_routine()', () => {
    const sql = quoted(capture(/create or replace function public\.store_activity_is_routine[\s\S]*?select p_kind in \(([^)]*)\)/))
    expect([...ROUTINE_KINDS].sort()).toEqual([...sql].sort())
  })

  it('has the same flags as store_activity_flags_ck', () => {
    const sql = quoted(capture(/constraint store_activity_flags_ck check \(flags <@ array\[([\s\S]*?)\]::text\[\]\)/))
    expect([...ACTIVITY_FLAGS]).toEqual(sql)
  })

  it('has the same subject types as store_activity_subject_type_ck', () => {
    const sql = quoted(capture(/constraint store_activity_subject_type_ck check \(subject_type is null or subject_type in \(([\s\S]*?)\)\)/))
    expect([...SUBJECT_TYPES]).toEqual(sql)
  })
})

describe('store activity taxonomy mirrors the contract table', () => {
  it('lists the same kinds per category, routine kinds in italics', () => {
    const rows = [...CONTRACT.matchAll(/^\| (\w+) \| ([a-z_.*, ]+) \|$/gm)]
    const contract = Object.fromEntries(
      rows.map((row) => [row[1], row[2].split(',').map((kind) => kind.trim().replace(/\*/g, ''))]),
    )
    const routine = rows.flatMap((row) => [...row[2].matchAll(/\*([a-z_.]+)\*/g)].map((match) => match[1]))

    expect(Object.fromEntries(ACTIVITY_CATEGORIES.map((c) => [c, [...KINDS_BY_CATEGORY[c]]]))).toEqual(contract)
    expect([...ROUTINE_KINDS].sort()).toEqual(routine.sort())
  })
})

describe('taxonomy helpers', () => {
  it('derives the category of every kind', () => {
    for (const category of ACTIVITY_CATEGORIES) {
      for (const kind of KINDS_BY_CATEGORY[category]) {
        expect(categoryOfKind(kind)).toBe(category)
      }
    }
    expect(ACTIVITY_KINDS).toHaveLength(Object.values(KINDS_BY_CATEGORY).flat().length)
  })

  it('recognises only known kinds and flags', () => {
    expect(isActivityKind('order.cancelled')).toBe(true)
    expect(isActivityKind('order.teleported')).toBe(false)
    expect(isActivityKind(42)).toBe(false)
    expect(isActivityFlag('drawer_variance')).toBe(true)
    expect(isActivityFlag('fraud')).toBe(false)
  })

  it('marks routine kinds', () => {
    expect(isRoutineKind('order.placed')).toBe(true)
    expect(isRoutineKind('order.cancelled')).toBe(false)
  })

  it('explains every flag in one plain sentence (design spec §4)', () => {
    for (const flag of ACTIVITY_FLAGS) {
      expect(FLAG_COPY[flag].chip).toBe('Check')
      expect(FLAG_COPY[flag].explanation).toMatch(/\.$/)
    }
    expect(FLAG_COPY.drawer_variance.explanation).toBe('Drawer counted ₱100 or more away from what was expected.')
    expect(FLAG_COPY.paid_then_cancelled.explanation).toBe(
      'Cancelled after it was paid, and no refund has been recorded yet.',
    )
  })

  it('keeps the contract thresholds', () => {
    expect(FLAG_THRESHOLDS).toEqual({ drawerVariancePesos: 100, countVariancePercent: 10, repeatCancelsPerDay: 3 })
  })
})
