/**
 * A branch account's confinement must reach the tables hanging off an order.
 *
 * `20260804120000_branch_scoped_order_reads.sql` narrowed `orders` and
 * `order_items` so a branch-locked account reads only its own branch. It could
 * not narrow `order_payments` or `order_revisions`: those tables were created
 * the day before, in `20260803120000_order_edit_and_payments.sql`, deliberately
 * "identical in shape to orders_select_by_tenant / orders_write_admin" — the
 * shape that migration then replaced. The copy was left behind.
 *
 * Both tables carry their own `outlet_id`, and both hold the figures the branch
 * split exists to separate: what each order was paid, in what tender, against
 * which reference, and every edit made to it afterwards. A branch manager
 * reaching the API with their own token receives all of it, for every branch —
 * the same leak the orders migration was written to close, one join away.
 *
 * Asserted against the migration corpus rather than a live connection, for the
 * reason given in `inventory-ledger-append-only.test.ts`: the corpus is the
 * source of truth for what the database allows, and replaying it catches a
 * later migration quietly widening what an earlier one narrowed.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')

/**
 * Order children that carry a branch and must honour it.
 *
 * `order_items` is not here: it has no `outlet_id` of its own and reads the
 * branch off its parent, which `20260804120000` already covers.
 */
const BRANCH_CARRYING_ORDER_CHILDREN = ['order_payments', 'order_revisions']

/**
 * The shared predicate from `20260804120000`. A policy that calls it honours a
 * branch lock by construction; one that inlines its own `app_users` lookup is
 * the fourth copy that migration's header warned about.
 */
const BRANCH_PREDICATE = 'app_user_may_see_order'

interface PolicyStatement {
  readonly name: string
  readonly body: string
}

const CREATE_POLICY =
  /CREATE\s+POLICY\s+(?:"([^"]+)"|([a-z0-9_]+))\s+ON\s+(?:public\.)?TABLE\b([\s\S]*?);/gi
const DROP_POLICY =
  /DROP\s+POLICY\s+IF\s+EXISTS\s+(?:"([^"]+)"|([a-z0-9_]+))\s+ON\s+(?:public\.)?TABLE\b/gi

function forTable(pattern: RegExp, table: string): RegExp {
  return new RegExp(pattern.source.replace('TABLE', table), pattern.flags)
}

/**
 * Replays every migration in filename order and returns the policies still
 * standing on `table` at the end, keyed by name.
 */
function survivingPolicies(table: string): Map<string, PolicyStatement> {
  const surviving = new Map<string, PolicyStatement>()

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

    for (const match of sql.matchAll(forTable(DROP_POLICY, table))) {
      surviving.delete(match[1] ?? match[2])
    }
    for (const match of sql.matchAll(forTable(CREATE_POLICY, table))) {
      const name = match[1] ?? match[2]
      surviving.set(name, { name, body: match[3] })
    }
  }

  return surviving
}

describe('a branch lock reaches the tables hanging off an order', () => {
  test.each(BRANCH_CARRYING_ORDER_CHILDREN)(
    '%s is still governed by policies at all',
    (table) => {
      // RLS denies by default, so a narrowing that dropped every policy would
      // satisfy the test below while making the table unusable.
      expect(survivingPolicies(table).size).toBeGreaterThan(0)
    }
  )

  test.each(BRANCH_CARRYING_ORDER_CHILDREN)(
    'every surviving policy on %s honours the account branch',
    (table) => {
      // Arrange / Act
      const surviving = survivingPolicies(table)

      // Assert
      const offenders = [...surviving.values()]
        .filter((policy) => !policy.body.includes(BRANCH_PREDICATE))
        .map((policy) => policy.name)

      expect(offenders).toEqual([])
    }
  )
})
