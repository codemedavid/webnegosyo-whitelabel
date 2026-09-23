'use client'

/**
 * Calling a loyalty route from the browser.
 *
 * The routes authenticate with the CALLER's own access token, not a cookie
 * session, so every admin surface has to attach a bearer. One helper, so a new
 * panel cannot arrive with a weaker error path — a loyalty read that fails must
 * throw, never resolve to an empty list that reads as "nobody is collecting".
 */

import { createClient } from '@/lib/supabase/client'

export async function callLoyaltyApi<T = Record<string, unknown>>(
  path: string,
  options: {
    tenantId: string
    query?: Record<string, string | null | undefined>
    body?: Record<string, unknown>
    failure?: string
  }
): Promise<T> {
  const client = createClient()
  const { data } = await client.auth.getSession()
  if (!data.session) throw new Error('Sign in to manage loyalty.')

  const params = new URLSearchParams({ tenantId: options.tenantId })
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value) params.set(key, value)
  }

  const response = await fetch(options.body ? path : `${path}?${params}`, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify({ tenantId: options.tenantId, ...options.body }) : undefined,
    cache: 'no-store',
  })

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(result?.error || options.failure || 'That request could not be completed.')
  }
  return result as T
}
