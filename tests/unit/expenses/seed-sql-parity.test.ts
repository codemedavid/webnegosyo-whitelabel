import { readFileSync } from 'fs'
import { join } from 'path'
import { SEED_CATEGORIES } from '@/lib/expenses/categories'

/**
 * The seed list lives twice: ensure_expense_categories() in the migration and
 * SEED_CATEGORIES in TypeScript (contract §4). This reads the migration TEXT
 * between `-- seed:begin` and `-- seed:end`, so a row changed on one side only
 * fails here instead of drifting between stores seeded by SQL and screens
 * drawn from TS.
 */
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261022120000_expenses.sql'), 'utf8')

const ROW = /\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(true|false),\s*(\d+)\s*\)/g

function sqlSeedRows() {
  const block = SQL.match(/-- seed:begin[^\n]*\n([\s\S]*?)-- seed:end/)
  if (!block) throw new Error('seed:begin / seed:end markers not found in the migration')
  return [...block[1].matchAll(ROW)].map((match) => ({
    systemKey: match[1],
    name: match[2],
    group: match[3],
    icon: match[4],
    needsNote: match[5] === 'true',
    sortOrder: Number(match[6]),
  }))
}

describe('expense category seed: SQL ⇄ TypeScript', () => {
  it('parses every seed row out of ensure_expense_categories', () => {
    const lines = SQL.match(/-- seed:begin[^\n]*\n([\s\S]*?)-- seed:end/)?.[1].split('\n').filter((line) => line.trim().startsWith('(')) ?? []
    expect(sqlSeedRows()).toHaveLength(lines.length)
    expect(lines).toHaveLength(27)
  })

  it('matches SEED_CATEGORIES row for row', () => {
    expect(sqlSeedRows()).toEqual(SEED_CATEGORIES.map((row) => ({ ...row })))
  })
})
