import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Every read of a staff row has to bring the pinned screen with it.
 *
 * There are two on the web — the store-wide People card and the branch Team
 * tab — and they render the same roster component, so a projection that omits
 * the column produces a card with no badge and a dialog that opens on "No
 * preference" for an account that has one. Nothing throws; the setting just
 * appears to have been forgotten.
 *
 * That exact failure has shipped twice in this repo. Asserting on the source
 * is crude, but it is the only thing that fails at the moment the column is
 * dropped rather than months later.
 */

const ROOT = join(__dirname, '..', '..')

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), 'utf8')
}

function selectsFrom(source: string, table: string): string[] {
  const pattern = new RegExp(`\\.from\\('${table}'\\)[\\s\\S]{0,200}?\\.select\\(\\s*'([^']+)'`, 'g')
  return [...source.matchAll(pattern)].map((match) => match[1])
}

describe('staff reads carry the pinned screen', () => {
  it('selects default_tab for the store-wide staff list', () => {
    const selects = selectsFrom(read('src', 'app', 'actions', 'staff.ts'), 'app_users')

    expect(selects).not.toHaveLength(0)
    expect(selects.some((columns) => columns.includes('default_tab'))).toBe(true)
  })

  it('selects default_tab for the branch team roster', () => {
    const selects = selectsFrom(read('src', 'lib', 'outlets', 'branch-page-data.ts'), 'app_users')

    expect(selects).not.toHaveLength(0)
    expect(selects.some((columns) => columns.includes('default_tab'))).toBe(true)
  })
})
