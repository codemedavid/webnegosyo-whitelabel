// The signed-in customer of one store's app: resolving a bearer session,
// reading and editing the app profile, signing out and deleting the account.
// Service role only (the tables are not exposed to anon/authenticated).
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } from '@/lib/supabase/admin'
import { AppReadError } from '@/lib/app-api/store-reads'
import type { AppProfile } from '@/lib/app-contract'
import { readBearerSession } from './session-token'

// Untyped until 20261026160000_customer_app_auth is applied and src/types/supabase.ts regenerated.
const admin = () => createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }) as unknown as SupabaseClient

const failed = (detail: string) => new AppReadError('the customer account', detail)

export interface CustomerSession {
  customerId: string
  tokenHash: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * The live session behind `Authorization: Bearer cs1.…` FOR THIS STORE (the
 * tenant comes from the build's X-App-Id, so another store's token is just
 * "signed out"). Slides the 60-day window. null = no valid session.
 */
export async function resolveCustomerSession(headers: { get(name: string): string | null }, tenantId: string): Promise<CustomerSession | null> {
  const tokenHash = readBearerSession(headers)
  if (!tokenHash) return null
  const { data, error } = await admin().rpc('touch_customer_app_session', { p_tenant_id: tenantId, p_token_hash: tokenHash })
  if (error) throw failed(error.message)
  if (!isRecord(data) || data.ok !== true || typeof data.customerId !== 'string') return null
  return { customerId: data.customerId, tokenHash }
}

/** The app profile; null when the account was deleted (its sessions are revoked with it). */
export async function readProfile(tenantId: string, customerId: string): Promise<AppProfile | null> {
  const client = admin()
  const [profile, customer] = await Promise.all([
    client.from('customer_app_profiles').select('display_name').eq('tenant_id', tenantId).eq('customer_id', customerId).maybeSingle(),
    client.from('customers').select('phone_e164, name').eq('tenant_id', tenantId).eq('id', customerId).maybeSingle(),
  ])
  if (profile.error) throw failed(profile.error.message)
  if (customer.error) throw failed(customer.error.message)
  if (!profile.data || !customer.data?.phone_e164) return null
  const name = profile.data.display_name ?? customer.data.name ?? null
  return { name: name && name.trim() ? name.trim().slice(0, 60) : null, phoneE164: customer.data.phone_e164 }
}

/** Sets the name the app shows; the store's own customer record keeps the name its staff typed. */
export async function updateProfileName(tenantId: string, customerId: string, name: string | null): Promise<boolean> {
  const { data, error } = await admin()
    .from('customer_app_profiles')
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .select('customer_id')
  if (error) throw failed(error.message)
  return (data ?? []).length === 1
}

export async function revokeSession(tenantId: string, tokenHash: string): Promise<void> {
  const { error } = await admin().rpc('revoke_customer_app_session', { p_tenant_id: tenantId, p_token_hash: tokenHash })
  if (error) throw failed(error.message)
}

/** Apple 5.1.1(v): the app account goes; the store keeps its customer record, orders and stamps. */
export async function deleteAccount(tenantId: string, customerId: string): Promise<void> {
  const { error } = await admin().rpc('delete_customer_app_account', { p_tenant_id: tenantId, p_customer_id: customerId })
  if (error) throw failed(error.message)
}

/** The draft app's App Review number, if one is set (service role; never sent to a phone). */
export async function readReviewPhone(tenantId: string): Promise<string | null> {
  const { data, error } = await admin().from('tenant_apps').select('review_phone_e164').eq('tenant_id', tenantId).maybeSingle()
  if (error) throw failed(error.message)
  return data?.review_phone_e164 ?? null
}
