import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * The checkout-leads code must only touch tables that actually exist.
 *
 * `checkout_lead_status_history` is declared in
 * `supabase/migrations/20260405000001_checkout_leads.sql` but was never applied
 * — `to_regclass('public.checkout_lead_status_history')` returns null against
 * the live database, while `checkout_leads` itself holds real rows.
 *
 * The consequence was invisible rather than loud: the write swallowed its
 * failure into `console.error`, and the detail panel rendered "No status
 * changes yet" forever. A superadmin reading that panel would conclude nobody
 * had touched the lead, which is a different claim from "we cannot record
 * whether anyone did".
 *
 * The feature was removed rather than completed because the pipeline it
 * audits has never been worked: all 69 leads sit at `initiated`. An audit
 * trail of status changes that never happen records nothing. If leads do get
 * worked later, apply the table and restore this — but build it because the
 * workflow exists, not before.
 */

const ROOTS = ['src/lib/checkout-leads', 'src/app/superadmin/checkout-leads', 'src/app/actions']

/** Tables that exist in the applied schema and may be referenced. */
const MISSING_TABLES = ['checkout_lead_status_history']

function sourceFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  return entries.flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('checkout-leads schema wiring', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root)))

  it('finds the checkout-leads source to scan', () => {
    // Guards against the scan silently passing because it read nothing.
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(MISSING_TABLES)(
    'never queries %s, which does not exist in the database',
    (table) => {
      // Matches a real PostgREST reference — `.from('table')` — not the prose
      // in a comment explaining why the table is deliberately not used.
      const query = new RegExp(String.raw`\.from\(\s*['"\`]${table}['"\`]`)
      const offenders = files.filter((file) => query.test(readFileSync(file, 'utf8')))

      expect(offenders.map((f) => f.replace(process.cwd() + '/', ''))).toEqual([])
    },
  )
})
