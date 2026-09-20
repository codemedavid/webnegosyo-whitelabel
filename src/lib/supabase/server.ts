import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'

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
