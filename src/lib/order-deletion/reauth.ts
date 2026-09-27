/**
 * Re-check the owner's password immediately before a deletion.
 *
 * A live session proves someone signed in at some point; it does not prove the
 * owner is at the keyboard now. The check signs in on a throwaway client that
 * persists nothing, confirms the account is the same one making the request,
 * then revokes that one new session (`signOutThisDevice`) — never the owner's
 * other devices or the MCP connector (see global-signout-kills-mcp-sessions).
 */
import { createClient } from '@supabase/supabase-js'
import { signOutThisDevice } from '@/lib/supabase/sign-out'
import type { PasswordCheck } from './types'

const INVALID_CREDENTIAL_CODES = new Set(['invalid_credentials', 'invalid_grant'])

export async function verifyAccountPassword(
  email: string,
  password: string,
  expectedUserId: string
): Promise<PasswordCheck> {
  if (!email || !password) return 'wrong'

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  )

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    const code = (error as { code?: string }).code
    // A wrong password is an answer; an outage is not, and must not count
    // against the owner's attempts.
    if (error.status === 400 && (!code || INVALID_CREDENTIAL_CODES.has(code))) return 'wrong'
    throw new Error(`Password check unavailable: ${error.message}`)
  }

  try {
    return data.user?.id === expectedUserId ? 'ok' : 'wrong'
  } finally {
    await signOutThisDevice(client).catch((signOutError: unknown) => {
      console.error('[order-deletion] could not revoke the re-auth session:', signOutError)
    })
  }
}
