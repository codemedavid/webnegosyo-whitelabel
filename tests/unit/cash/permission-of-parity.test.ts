/**
 * public.app_user_has_permission_of(p_user, …) (20261027160000) answers
 * app_user_has_permission's question for ANY user — the receiver of a cash
 * hand-over, the person who took a pickup — which app_user_has_permission
 * cannot (it answers only for auth.uid()). It must be the very same rule:
 * its body is the newest app_user_has_permission body with `auth.uid()`
 * replaced by `p_user`, and nothing else. Change one, change the other.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'supabase/migrations')
const NEWEST_FIRST = readdirSync(DIR).filter((name) => name.endsWith('.sql')).sort().reverse()

function newestBody(signature: RegExp): { file: string; body: string } {
  for (const file of NEWEST_FIRST) {
    const sql = readFileSync(path.join(DIR, file), 'utf8')
    const match = sql.match(new RegExp(`${signature.source}[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`))
    if (match) return { file, body: match[1] }
  }
  throw new Error(`not found: ${signature}`)
}

const normalise = (sql: string) => sql.replace(/\s+/g, ' ').trim()

describe('app_user_has_permission_of mirrors app_user_has_permission', () => {
  it('has the same body with auth.uid() → p_user', () => {
    const caller = newestBody(/create or replace function public\.app_user_has_permission\(p_tenant_id uuid, p_permission text\)/)
    const anyone = newestBody(/create or replace function public\.app_user_has_permission_of\(p_user uuid, p_tenant_id uuid, p_permission text\)/)
    expect(caller.body).toContain('au.user_id = auth.uid()')
    expect({ from: anyone.file, body: normalise(anyone.body) }).toEqual({
      from: anyone.file,
      body: normalise(caller.body.replace('au.user_id = auth.uid()', 'au.user_id = p_user')),
    })
  })
})
