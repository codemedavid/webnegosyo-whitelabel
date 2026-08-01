/**
 * The stock ledger is append-only, and nothing may quietly re-open it.
 *
 * `stock_movements` is the evidence behind every number the daily report shows:
 * the day's usage, its shrinkage, and the verdict that grades it. A row removed
 * or edited after the fact does NOT restore `inventory_items.current_qty` — the
 * trigger only fires on INSERT — so a deleted movement leaves the shelf figure
 * intact while the history that explains it is gone. Every past report then
 * reconciles to a different, wrong answer, and states it with confidence.
 *
 * `20260726120000_inventory_stock_ledger.sql` created both policies `FOR ALL`,
 * which includes DELETE and UPDATE. A probe against the live database (recorded
 * in docs/testing/inventory-cost-unit-phase0.tdd.md) confirmed a tenant admin
 * could do both.
 *
 * The migration corpus is the source of truth for what the database allows, so
 * that is what this asserts on. The complementary test below covers the code
 * side: the app has never needed either verb, so the lockdown costs it nothing.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')

/** The only two verbs the ledger may grant. Anything else can rewrite history. */
const APPEND_ONLY_COMMANDS = ['SELECT', 'INSERT']

const CREATE_POLICY =
  /CREATE\s+POLICY\s+(?:"([^"]+)"|([a-z0-9_]+))\s+ON\s+(?:public\.)?stock_movements\s+FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/gi
const DROP_POLICY =
  /DROP\s+POLICY\s+IF\s+EXISTS\s+(?:"([^"]+)"|([a-z0-9_]+))\s+ON\s+(?:public\.)?stock_movements/gi

/**
 * Replays every migration in filename order and returns the policies still
 * standing at the end, as `name -> command`.
 *
 * Replaying rather than reading the newest file is the point: a lockdown that a
 * later migration silently undoes would still pass a test that only looked at
 * one file.
 */
function survivingLedgerPolicies(): Map<string, string> {
  const surviving = new Map<string, string>()

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

    for (const match of sql.matchAll(DROP_POLICY)) {
      surviving.delete(match[1] ?? match[2])
    }
    for (const match of sql.matchAll(CREATE_POLICY)) {
      surviving.set(match[1] ?? match[2], match[3].toUpperCase())
    }
  }

  return surviving
}

describe('the stock ledger is append-only', () => {
  test('every surviving policy grants only SELECT or INSERT', () => {
    // Arrange / Act
    const surviving = survivingLedgerPolicies()

    // Assert
    const offenders = [...surviving.entries()]
      .filter(([, command]) => !APPEND_ONLY_COMMANDS.includes(command))
      .map(([name, command]) => `${name} FOR ${command}`)

    expect(offenders).toEqual([])
  })

  test('the ledger still has policies at all', () => {
    // A lockdown that dropped every policy would pass the test above while
    // making the ledger unreadable and unwritable — RLS denies by default.
    expect(survivingLedgerPolicies().size).toBeGreaterThan(0)
  })

  test('someone can still read and write the ledger', () => {
    // The report reads it; the register and the receiving dialog write it.
    const commands = new Set(survivingLedgerPolicies().values())

    expect(commands).toContain('SELECT')
    expect(commands).toContain('INSERT')
  })
})
