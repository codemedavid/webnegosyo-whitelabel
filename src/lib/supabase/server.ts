import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'
import { getRequestBearerToken } from '@/lib/supabase/bearer-session'

/**
 * A stalled database must fail a request fast rather than hold the lambda
 * open until the platform kills it. PostgREST already cancels an authenticated
 * statement after 8s, so no single call can legitimately outlast this.
 */
export const SERVER_QUERY_TIMEOUT_MS = 10_000

/** The cookie-bound Supabase client for Server Components, Actions and route handlers. */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  }

  // A route wrapped in `withRequestBearer` (the merchant app) acts as the
  // token's user; see bearer-session.ts. Browsers never take this branch.
  const bearerToken = getRequestBearerToken()
  if (bearerToken) {
    return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` }, fetch: createTimedFetch(SERVER_QUERY_TIMEOUT_MS) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { retry: false },
    }) as unknown as ReturnType<typeof createServerClient<Database>>
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, which cannot write cookies. Safe to
          // ignore: the middleware refreshes the session cookie.
        }
      },
    },
    db: { retry: false },
    global: { fetch: createTimedFetch(SERVER_QUERY_TIMEOUT_MS) },
  })
}
