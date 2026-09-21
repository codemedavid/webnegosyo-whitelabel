import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'

/**
 * Budget for a service-role call that must answer before Vercel's 25s
 * middleware cap. PostgREST already cancels an authenticated statement after
 * 8s; waiting longer only holds the isolate open.
 */
export const ADMIN_QUERY_TIMEOUT_MS = 8_000

export interface AdminClientOptions {
  /**
   * When set, every fetch this client makes is aborted after `timeoutMs` and
   * PostgREST retries are disabled. Omit it for long jobs (Loyverse reconcile)
   * that issue many sequential queries and have their own `maxDuration`.
   */
  timeoutMs?: number
}

/**
 * Server-side Supabase Admin client with service role privileges
 * WARNING: Only use this in server-side code (Server Actions, API Routes)
 * NEVER expose this client to the browser
 */
export function createAdminClient(options: AdminClientOptions = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  const timeoutMs = options.timeoutMs

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(timeoutMs
      ? {
          db: { retry: false },
          global: { fetch: createTimedFetch(timeoutMs) },
        }
      : {}),
  })
}

