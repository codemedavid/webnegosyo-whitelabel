import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sign-out scope for every logout button in the web app.
 *
 * Supabase's default (`global`) revokes EVERY session the user has — every
 * colleague's browser, the merchant app, and the Claude/ChatGPT MCP connector's
 * OAuth session. With a shared account that meant one person clicking Logout
 * kicked the whole team and broke the MCP connector until it re-authorized.
 *
 * `local` ends only the session on this device (the server still revokes that
 * one refresh token, so it is not weaker — just narrower).
 */
export const SIGN_OUT_SCOPE = 'local' as const

type SignOutCapable = { auth: Pick<SupabaseClient['auth'], 'signOut'> }

/** Ends this device's session and nothing else. Use instead of `auth.signOut()`. */
export function signOutThisDevice(supabase: SignOutCapable) {
  return supabase.auth.signOut({ scope: SIGN_OUT_SCOPE })
}
