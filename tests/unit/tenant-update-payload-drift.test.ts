/**
 * The superadmin tenant form has two independent writers.
 *
 * `src/actions/tenants.ts` builds its own create/update payloads and issues the
 * UPDATE for the superadmin form; `src/lib/tenants-service.ts` builds a second,
 * near-identical pair used by the provisioning/MCP path. A column added to one
 * and not the other does not fail a type check and does not error at runtime —
 * the save simply succeeds while silently discarding that field.
 *
 * That has now bitten three times: `order_backend`, `modifier_groups_enabled`,
 * and `outlet_selection_timing` (the branch-timing dropdown appeared to save
 * and always read back 'before'). This test is the guard: any column the
 * service writes must also be written by the action the form actually calls.
 *
 * It reads source text rather than calling the action because the action needs
 * a superadmin session and a live Supabase client; the defect is structural, so
 * checking the structure catches it at the same place a reviewer would.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

/** Every column assigned from the validated input, e.g. `foo: parsed.foo`. */
function writtenColumns(relativePath: string): Set<string> {
  const source = readFileSync(join(ROOT, relativePath), 'utf8')
  return new Set([...source.matchAll(/(\w+):\s*parsed\./g)].map((match) => match[1]))
}

/**
 * Known, deliberate exceptions.
 *
 * `messenger_redirect_mode` is submitted by the new superadmin form but NOT by
 * the legacy `tenant-form.tsx`. Adding it to the action would make a save from
 * the legacy form write the zod default ('webhook') over a tenant's real
 * choice, so the drift here is the safer of two bugs until the legacy form
 * carries the field.
 */
const ALLOWED_DRIFT = new Set(['messenger_redirect_mode'])

describe('superadmin tenant write path', () => {
  it('writes every tenant column the provisioning service writes', () => {
    const service = writtenColumns('src/lib/tenants-service.ts')
    const action = writtenColumns('src/actions/tenants.ts')

    const dropped = [...service]
      .filter((column) => !action.has(column))
      .filter((column) => !ALLOWED_DRIFT.has(column))
      .sort()

    expect(dropped).toEqual([])
  })

  it('saves the branch-timing choice the Branches card offers', () => {
    expect(writtenColumns('src/actions/tenants.ts')).toContain('outlet_selection_timing')
  })
})
