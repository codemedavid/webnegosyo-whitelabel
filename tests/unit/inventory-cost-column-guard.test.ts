/**
 * @jest-environment node
 *
 * Cost secrecy guard (migration 20261107130100 revokes SELECT on
 * `unit_cost` of inventory_items, stock_movements and stock_transfer_lines for
 * client roles). After it, three things fail at runtime and nowhere else, so a
 * test has to catch them:
 *
 *  1. a session-client `select('*')` / bare `.select()` on those tables (src/ and
 *     the merchant app) — "permission denied" for every caller;
 *  2. a session-client select that names `unit_cost` — the price comes from the
 *     `costs`-gated readers (src/lib/inventory/item-costs.ts, the app's
 *     lib/inventory-costs.ts), never from the table;
 *  3. a later migration that adds a column to one of these tables without
 *     granting it (the revoke leaves a column list, not a table grant).
 *
 * Service-role readers are exempt: files that build their client with
 * createAdminClient (order pipeline, MCP, provisioning).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const COST_TABLES = ['inventory_items', 'stock_movements', 'stock_transfer_lines'] as const
const SCANNED_ROOTS = [
  'src',
  'webnegosyo-app/lib',
  'webnegosyo-app/components',
  'webnegosyo-app/app',
  'webnegosyo-app/hooks',
  'webnegosyo-app/stores',
  'webnegosyo-desktop/src',
  'mobile/lib',
  'mobile/app',
  'supabase/functions',
]
const SKIP_DIRS = new Set(['node_modules', '.next', 'tests', '__tests__'])

function listSources(dir: string): string[] {
  const absolute = path.join(ROOT, dir)
  try {
    statSync(absolute)
  } catch {
    return []
  }
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : listSources(relative)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) ? [relative] : []
  })
}

const FROM_COST_TABLE = new RegExp(`\\.from\\(\\s*(['"\`])(${COST_TABLES.join('|')})\\1\\s*\\)`, 'g')
const EMBEDDED_STAR = new RegExp(`(${COST_TABLES.join('|')})(?:![A-Za-z_]+)?\\s*\\(\\s*\\*`)
// The start of an embed, e.g. `stock_transfer_lines(` or `inventory_items!inner(`.
const EMBED_START = new RegExp(`(${COST_TABLES.join('|')})(?:![A-Za-z_]+)?\\s*\\(`, 'g')

/** The embed's OWN column list: what sits inside its parentheses, nested embeds removed. */
function embedOwnColumns(source: string, openParen: number): string {
  let depth = 0
  let own = ''
  for (let i = openParen; i < source.length; i += 1) {
    const char = source[i]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    if (depth === 0) break
    if (depth === 1 && char !== '(') own += char
  }
  // A nested embed's table name stays behind once its parentheses are dropped; harmless.
  return own
}
// A file that builds a session (cookie / signed-in) client. The service-role
// exemption below only holds for files that cannot reach one.
const SESSION_CLIENT = /from\s+['"](?:@\/lib\/supabase\/(?:server|client)|(?:\.\.?\/)+(?:lib\/)?supabase)['"]|createBrowserClient|createServerClient/

interface Finding {
  file: string
  line: number
  table: string
  why: string
}

/** Named string constants in a file: `const STORED_COLUMNS = '...'`. */
function constants(source: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of source.matchAll(/const\s+([A-Za-z_]+)\s*=\s*((?:\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*\+?)+)/g)) {
    found.set(match[1], match[2])
  }
  return found
}

export function findCostColumnReads(
  file: string,
  source: string,
  sharedConstants: ReadonlyMap<string, string> = new Map(),
): Finding[] {
  const isServiceRoleOnly = /createAdminClient|AdminClient\b/.test(source) && !SESSION_CLIENT.test(source)
  if (isServiceRoleOnly) return []
  const named = new Map([...sharedConstants, ...constants(source)])
  const findings: Finding[] = []
  for (const match of source.matchAll(FROM_COST_TABLE)) {
    const start = match.index ?? 0
    const chain = source.slice(start, start + 700).split(/;\s*\n/)[0]
    const line = source.slice(0, start).split('\n').length
    const table = match[2]
    const select = chain.match(/\.select\(\s*([^)]*?)\s*\)/)
    if (!select) continue
    const argument = select[1]
    if (argument === '' || /^(['"`])\*\1/.test(argument)) {
      findings.push({ file, line, table, why: 'select(*) or a bare .select() asks for every column, including unit_cost' })
      continue
    }
    const resolved = /^[A-Z_]+$/.test(argument) ? (named.get(argument) ?? '') : argument
    if (/unit_cost/.test(resolved) || /(^|[^a-z_])\*/.test(resolved.replace(/(['"`])/g, ''))) {
      findings.push({ file, line, table, why: 'the column list names unit_cost (or *)' })
    }
  }
  for (const match of source.matchAll(new RegExp(EMBEDDED_STAR, 'g'))) {
    findings.push({ file, line: source.slice(0, match.index ?? 0).split('\n').length, table: match[1], why: 'embedded select of every column' })
  }
  for (const match of source.matchAll(EMBED_START)) {
    // Only the embed's own columns: a nested embed of another table may name its own unit_cost.
    const ownColumns = embedOwnColumns(source, (match.index ?? 0) + match[0].length - 1)
    if (/(^|[^a-z_])unit_cost([^a-z_]|$)/.test(ownColumns)) {
      findings.push({ file, line: source.slice(0, match.index ?? 0).split('\n').length, table: match[1], why: 'an embedded select names unit_cost' })
    }
  }
  return findings
}

describe('findCostColumnReads (the detector itself)', () => {
  const read = (code: string) => findCostColumnReads('x.ts', code).map((finding) => finding.why)

  test('flags select(*), a bare select, and a named unit_cost', () => {
    expect(read(`await supabase.from('inventory_items').select('*').eq('a', 1)`)).toHaveLength(1)
    expect(read(`await supabase.from("stock_movements").insert(x).select()`)).toHaveLength(1)
    expect(read(`supabase.from('inventory_items').select('id, unit_cost')`)).toHaveLength(1)
    expect(read(`const COLS = 'id, unit_cost'\nsupabase.from('inventory_items').select(COLS)`)).toHaveLength(1)
    expect(read(`supabase.from('x').select('id, stock_transfer_lines(*)')`)).toHaveLength(1)
  })

  test('flags an embed that names unit_cost, with or without a join hint', () => {
    expect(read(`supabase.from('stock_transfers').select('id, stock_transfer_lines(id, unit_cost)')`)).toHaveLength(1)
    expect(read(`supabase.from('recipe_components').select('quantity, inventory_items!inner(name, unit_cost)')`)).toHaveLength(1)
    expect(read(`supabase.from('x').select('id, stock_movements!fk(*)')`)).toHaveLength(1)
    expect(read(`supabase.from('stock_transfers').select('id, stock_transfer_lines(id, inventory_items(name, unit_cost))')`)).toHaveLength(1)
  })

  test('resolves a column list imported from another file', () => {
    const shared = new Map([['SHARED_COLUMNS', "'id, name, unit_cost'"]])
    expect(findCostColumnReads('x.ts', `supabase.from('inventory_items').select(SHARED_COLUMNS)`, shared)).toHaveLength(1)
  })

  test('a file that also builds a session client is not exempt as service-role', () => {
    const code = `import { createClient } from '@/lib/supabase/server'\nimport { createAdminClient } from '@/lib/supabase/admin'\nsupabase.from('inventory_items').select('*')`
    expect(read(code)).toHaveLength(1)
  })

  test('accepts explicit non-cost lists, other tables, and the service role', () => {
    expect(read(`supabase.from('inventory_items').select('id, name')`)).toEqual([])
    expect(read(`supabase.from('inventory_units').select('*')`)).toEqual([])
    expect(read(`const admin = createAdminClient()\nadmin.from('inventory_items').select('*')`)).toEqual([])
    expect(read(`const COLS = 'id, name'\nsupabase.from('inventory_items').select(COLS)`)).toEqual([])
    expect(read(`supabase.from('stock_transfers').select('id, stock_transfer_lines(id, inventory_items(name, inventory_units(abbreviation)))')`)).toEqual([])
  })
})

describe('no client read of a cost column', () => {
  const sources = SCANNED_ROOTS.flatMap(listSources).map((file) => ({ file, source: readFileSync(path.join(ROOT, file), 'utf8') }))
  // Exported column lists (src/lib/inventory/cost-columns.ts and friends) are
  // resolved wherever they are imported, so adding unit_cost to one is caught.
  const sharedConstants = new Map(
    sources.flatMap(({ source }) =>
      [...source.matchAll(/export\s+const\s+([A-Z_]+)\s*=\s*((?:\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*\+?)+)/g)].map(
        (match) => [match[1], match[2]] as const,
      ),
    ),
  )
  const findings = sources.flatMap(({ file, source }) => findCostColumnReads(file, source, sharedConstants))

  test('the shared column lists are resolved, and none names unit_cost', () => {
    for (const name of ['INVENTORY_ITEM_COLUMNS', 'STOCK_MOVEMENT_COLUMNS', 'STOCK_TRANSFER_LINE_COLUMNS']) {
      expect(sharedConstants.get(name)).toMatch(/inventory_item_id|current_qty/)
      expect(sharedConstants.get(name)).not.toMatch(/unit_cost/)
    }
  })

  test('src/ and the merchant app select explicit non-cost columns', () => {
    expect(findings.map((f) => `${f.file}:${f.line} ${f.table}: ${f.why}`)).toEqual([])
  })
})

describe('later migrations keep the column grants complete', () => {
  const REVOKE_VERSION = '20261107130100'
  const migrations = readdirSync(path.join(ROOT, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql') && name.slice(0, 14) > REVOKE_VERSION)

  test.each(COST_TABLES)('a column added to %s is granted to the client roles', (table) => {
    const offenders = migrations.filter((name) => {
      const sql = readFileSync(path.join(ROOT, 'supabase/migrations', name), 'utf8')
      const addsColumn = new RegExp(`alter\\s+table\\s+(if\\s+exists\\s+)?(public\\.)?${table}\\b[^;]*add\\s+column`, 'i').test(sql)
      const grantsIt = new RegExp(`grant\\s+select\\s*\\([^)]*\\)\\s+on\\s+(table\\s+)?(public\\.)?${table}\\b`, 'i').test(sql)
      return addsColumn && !grantsIt
    })
    expect(offenders).toEqual([])
  })
})
