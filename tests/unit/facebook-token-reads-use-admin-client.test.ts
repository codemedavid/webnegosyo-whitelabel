/**
 * The Facebook page tokens are the keys to a merchant's Messenger presence:
 * `page_access_token` can post as their page and read their conversations.
 *
 * They were readable with the public anon key, because every route that needed
 * one asked for it through the SSR client — which runs as `anon` on an
 * unauthenticated request like the Facebook webhook. That forced the `anon`
 * role to hold SELECT on the whole table, and the anon key ships in the browser
 * bundle.
 *
 * The database side of the fix revokes that grant. This test locks the code
 * side, which has to land first: a token may only be read through the
 * service-role client, so no such read depends on a grant we are taking away.
 *
 * Written as a scan rather than a list so a new route cannot reintroduce the
 * hole by being added after this test was written.
 */

import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { globSync } from 'glob'

const SRC = join(process.cwd(), 'src')
const TOKEN_COLUMNS = ['page_access_token', 'user_access_token']
const ADMIN_CLIENT = '@/lib/supabase/admin'

/** Files that read a token column out of the database. */
function filesReadingTokens(): string[] {
  const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
  return files.filter((file) => {
    if (/\.test\.|\/types\//.test(file)) return false
    const source = readFileSync(file, 'utf8')
    // Only a projection counts. Writing a token, or naming one in a type, is
    // not a read and does not depend on the grant being revoked.
    return TOKEN_COLUMNS.some((column) =>
      new RegExp(`\\.select\\([^)]*${column}`, 's').test(source),
    )
  })
}

describe('Facebook token reads', () => {
  it('finds the routes that read a page or user access token', () => {
    // Guards the scan itself: if this hits zero the assertions below pass
    // vacuously and the protection silently disappears.
    expect(filesReadingTokens().length).toBeGreaterThan(0)
  })

  it('reads every token through the service-role client, never the anon key', () => {
    const offenders = filesReadingTokens()
      .filter((file) => !readFileSync(file, 'utf8').includes(ADMIN_CLIENT))
      .map((file) => relative(process.cwd(), file))
      .sort()

    expect(offenders).toEqual([])
  })

  it('never reads a token from the browser client', () => {
    const offenders = filesReadingTokens()
      .filter((file) => readFileSync(file, 'utf8').includes('@/lib/supabase/client'))
      .map((file) => relative(process.cwd(), file))
      .sort()

    expect(offenders).toEqual([])
  })
})
