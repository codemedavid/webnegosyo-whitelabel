import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'

/**
 * The anonymous, cookie-free Supabase client for public storefront reads.
 *
 * The storefront (menu, product detail, tenant chrome) shows the same thing to
 * every visitor, yet it used to read through `createClient()` from
 * `supabase/server.ts`, which binds the request's cookies. Two consequences:
 * `cookies()` opts the whole route into dynamic rendering, so the page's ISR
 * `revalidate` was inert, and a cookie-bound read cannot live inside
 * `unstable_cache`. Every page view therefore ran its full query plan against
 * the database — the amplifier behind the 2026-09-20/21 statement timeouts.
 *
 * This client carries no session and never touches cookies, so a read made
 * with it can be cached across requests. Row-level security still applies
 * exactly as it does for an anonymous browser: only `USING (true)` rows are
 * visible, which is the storefront's contract.
 *
 * The fetch is bounded: Supabase's client never times out on its own, and a
 * stalled database must fail the read fast so the page can degrade instead of
 * holding a lambda open until the 2-minute statement timeout fires.
 */
export const PUBLIC_QUERY_TIMEOUT_MS = 8_000

export type PublicSupabaseClient = SupabaseClient<Database>

let instance: PublicSupabaseClient | null = null

function readRequiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} environment variable`)
  }
  return value
}

/**
 * Returns the shared public client. Safe to memoise: it holds no per-request
 * state, and constructing one per call would only cost allocations.
 */
export function createPublicClient(): PublicSupabaseClient {
  if (instance) return instance

  const supabaseUrl = readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseAnonKey = readRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  instance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { retry: false },
    global: { fetch: createTimedFetch(PUBLIC_QUERY_TIMEOUT_MS) },
  })

  return instance
}

/**
 * A visitor-safe description of a failed public read.
 *
 * The bounded fetch surfaces as an `AbortError`, which means nothing to a
 * customer and would be mistaken for a bug by a merchant; name the cause.
 */
export function describePublicQueryError(message: string): string {
  return /abort/i.test(message)
    ? `the database did not answer within ${PUBLIC_QUERY_TIMEOUT_MS / 1000}s`
    : message
}

/** Test seam: drop the memoised client so a test can re-read the environment. */
export function resetPublicClient(): void {
  instance = null
}
