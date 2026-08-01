// Superadmin API bridge for the mobile console.
//
// The app performs everything it can directly against Supabase under the
// superadmin's own RLS grant. This endpoint exists only for operations needing
// the service-role key or a server-side secret, which must never ship in an app
// binary. See src/lib/superadmin/bridge.ts for the allowlist.
//
// Auth differs from the web console: there are no cookies here, so the caller
// presents their Supabase access token as `Authorization: Bearer <token>`. The
// token is verified and the role re-checked from app_users on every request —
// the client's claim of being a superadmin is never trusted.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  extractBearerToken,
  isBridgeAction,
  validateBridgePayload,
} from '@/lib/superadmin/bridge'

/**
 * Resolve the bearer token to a superadmin user id, or null.
 *
 * Uses an anon-key client purely to validate the JWT, then re-reads the role
 * from app_users with the service-role client. A JWT can carry stale or
 * attacker-supplied metadata; app_users is the source of truth.
 */
async function resolveSuperadmin(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const authClient = createSupabaseClient(url, anonKey)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return null

  const admin = createAdminClient()
  const { data: appUser } = await admin
    .from('app_users')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle()

  const role = (appUser as { role?: string } | null)?.role
  return role === 'superadmin' ? data.user.id : null
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  const { action } = await context.params

  // Reject unknown actions before doing any auth work, so an attacker probing
  // the surface learns nothing about which names are real from timing alone.
  if (!isBridgeAction(action)) {
    return jsonError(`Unknown action: ${action}`, 404)
  }

  const token = extractBearerToken(request.headers.get('authorization'))
  if (!token) {
    return jsonError('Missing bearer token', 401)
  }

  const userId = await resolveSuperadmin(token)
  if (!userId) {
    return jsonError('Superadmin access required', 403)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  const validation = validateBridgePayload(action, payload)
  if (!validation.ok) {
    return jsonError(validation.error, 400)
  }

  // Handlers are wired incrementally; an allowlisted action without one yet
  // answers 501 rather than pretending to have done the work.
  return jsonError(
    `Action "${action}" is not wired up yet`,
    501
  )
}
