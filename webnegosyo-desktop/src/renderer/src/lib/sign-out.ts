import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sign-out scope for the desktop POS. Mirrors `src/lib/supabase/sign-out.ts`
 * in the web app — the accounts are shared across web, merchant app, desktop
 * and the MCP connector.
 *
 * Supabase's default (`global`) revokes EVERY session the user has: every
 * other browser, phone and the Claude/ChatGPT MCP connector. A superadmin who
 * tried this POS (no store → failed login → sign-out) logged out everywhere.
 *
 * `local` ends only this device's session (still revoked server-side).
 */
export const SIGN_OUT_SCOPE = 'local' as const

type SignOutCapable = { auth: Pick<SupabaseClient['auth'], 'signOut'> }

/** Ends this device's session and nothing else. Use instead of `auth.signOut()`. */
export function signOutThisDevice(supabase: SignOutCapable) {
  return supabase.auth.signOut({ scope: SIGN_OUT_SCOPE })
}
