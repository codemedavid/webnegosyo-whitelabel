/**
 * Turn a request into a verified store owner, or a refusal response.
 *
 * Shared by every order-deletion route so none can drift into a weaker check.
 * The web admin authenticates with its session cookie (and must be same-origin
 * on writes); the merchant app sends its own access token as a Bearer header.
 * Either way the account must be this store's owner, and the store must keep
 * its orders on the platform database — Convex stores are not supported.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createTokenClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { decideOwnerAccess, isSameOriginRequest, type OwnerCandidate } from './access'
import type { DeletionCaller, DeletionStore } from './types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OwnerResolution =
  | { ok: true; caller: DeletionCaller; store: DeletionStore; admin: SupabaseClient }
  | { ok: false; response: NextResponse }

function refuse(message: string, status: number): OwnerResolution {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) }
}

async function readSessionUser(request: NextRequest, isWrite: boolean) {
  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const client = createTokenClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
    return (await client.auth.getUser()).data.user
  }

  // The session cookie rides along on any request to this host, so a write
  // must prove it came from one of our own pages.
  if (isWrite && !isSameOriginRequest(request.headers)) return null
  const client = await createCookieClient()
  return (await client.auth.getUser()).data.user
}

export async function resolveOwnerCaller(
  request: NextRequest,
  tenantId: unknown,
  { isWrite }: { isWrite: boolean }
): Promise<OwnerResolution> {
  if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
    return refuse('A valid store id is required.', 400)
  }

  const user = await readSessionUser(request, isWrite)
  if (!user) return refuse('Sign in again to continue.', 401)
  if (!user.email) return refuse('This account has no email to confirm a password against.', 403)

  const admin: SupabaseClient = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })

  const { data: appUser, error: appUserError } = await admin
    .from('app_users')
    .select('role, tenant_id, is_owner')
    .eq('user_id', user.id)
    .maybeSingle()
  if (appUserError) {
    console.error('[order-deletion] could not read the caller:', appUserError.message)
    return refuse('Could not verify your account. Try again.', 503)
  }

  const access = decideOwnerAccess((appUser as OwnerCandidate | null) ?? null, tenantId)
  if (!access.allowed) {
    return refuse('Only the store owner can delete orders.', 403)
  }

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id, name, slug, order_backend, convex_deployment_url')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantError || !tenant) {
    if (tenantError) console.error('[order-deletion] could not read the store:', tenantError.message)
    return refuse('Store not found.', 404)
  }
  if (resolveOrderBackend(tenant as OrderBackendTenantFields) !== 'platform') {
    return refuse('Deleting orders is not available for this store yet.', 409)
  }

  const store = tenant as { id: string; name: string; slug: string }
  return {
    ok: true,
    caller: { userId: user.id, email: user.email, tenantId },
    store: { id: store.id, name: store.name, slug: store.slug },
    admin,
  }
}
