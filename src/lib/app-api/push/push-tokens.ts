import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'
import { appPushTokenRegistrationSchema } from '@/lib/app-contract'
import type { AppRouteContext } from '@/lib/app-api/app-route'
import { readAppJson } from '@/lib/app-api/request-body'
import { appFail, appOk } from '@/lib/app-api/respond'
import { AppReadError } from '@/lib/app-api/store-reads'
import { resolveCustomerSession } from '@/lib/customer-auth/account'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'

/**
 * This install's Expo push token for the signed-in session (P7). The store is
 * the build's (X-App-Id), the account is the session's: a token can only ever
 * be filed under the customer who is signed in on that phone right now.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }
const SIGNED_OUT = 'Please sign in again.'

// Untyped until src/types/supabase.ts is regenerated after 20261112150000.
const admin = () => createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }) as unknown as SupabaseClient
const failed = (detail: string) => new AppReadError('the notification settings', detail)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Every token the session behind this token hash registered, at this store. */
export async function removeSessionPushTokens(tenantId: string, sessionTokenHash: string): Promise<void> {
  const { error } = await admin().rpc('remove_customer_app_push_tokens', { p_tenant_id: tenantId, p_session_token_hash: sessionTokenHash })
  if (error) throw failed(error.message)
}

/** POST registers this install, DELETE turns its notifications off. */
export async function handlePushToken({ request, app }: AppRouteContext): Promise<NextResponse> {
  const session = await resolveCustomerSession(request.headers, app.tenantId)
  if (!session) return appFail('unauthorized', SIGNED_OUT)

  if (request.method === 'DELETE') {
    await removeSessionPushTokens(app.tenantId, session.tokenHash)
    return appOk({ registered: false }, { headers: NO_STORE })
  }

  const parsed = appPushTokenRegistrationSchema.safeParse(await readAppJson(request))
  if (!parsed.success) return appFail('bad_request', 'That notification token is not valid.')
  const { data, error } = await admin().rpc('register_customer_app_push_token', {
    p_tenant_id: app.tenantId,
    p_session_token_hash: session.tokenHash,
    p_expo_token: parsed.data.token,
    p_platform: parsed.data.platform,
    p_app_version: parsed.data.appVersion,
  })
  if (error) throw failed(error.message)
  if (!isRecord(data) || data.ok !== true) return appFail('unauthorized', SIGNED_OUT)
  return appOk({ registered: true }, { headers: NO_STORE })
}
