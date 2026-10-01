/**
 * Service-role reads and writes for wallet passes and Apple device
 * registrations. The tables are closed to every API role; nothing here may be
 * called with a user's client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface WalletPassRow {
  id: string
  tenant_id: string
  program_id: string
  customer_key: string
  serial_number: string
  content_hash: string | null
  content_updated_at: string
  apple_pushed_hash: string | null
  google_synced_hash: string | null
}

const PASS_SELECT = 'id, tenant_id, program_id, customer_key, serial_number, content_hash, content_updated_at, apple_pushed_hash, google_synced_hash'
/** Upper bound on cards refreshed for one programme change in a single call. */
export const PROGRAM_SYNC_LIMIT = 1000
/** No real device holds more cards than this from one platform. */
const DEVICE_REGISTRATION_LIMIT = 500

function fail(action: string, message: string): never {
  throw new Error(`wallet pass ${action} failed: ${message}`)
}

export async function findPassBySerial(client: SupabaseClient, serial: string): Promise<WalletPassRow | null> {
  const { data, error } = await client.from('loyalty_wallet_passes').select(PASS_SELECT).eq('serial_number', serial).maybeSingle()
  if (error) fail('read', error.message)
  return (data as WalletPassRow | null) ?? null
}

export async function findPassById(client: SupabaseClient, id: string): Promise<WalletPassRow | null> {
  const { data, error } = await client.from('loyalty_wallet_passes').select(PASS_SELECT).eq('id', id).maybeSingle()
  if (error) fail('read', error.message)
  return (data as WalletPassRow | null) ?? null
}

export async function listPassesForProgram(client: SupabaseClient, programId: string): Promise<WalletPassRow[]> {
  const { data, error } = await client
    .from('loyalty_wallet_passes')
    .select(PASS_SELECT)
    .eq('program_id', programId)
    .order('created_at', { ascending: true })
    .limit(PROGRAM_SYNC_LIMIT)
  if (error) fail('list', error.message)
  return (data ?? []) as WalletPassRow[]
}

/**
 * The member's pass, created on first request. Race-safe: two taps on "Add to
 * Wallet" insert-or-ignore on (program, customer) and both read back the one
 * row, so a member can never end up with two serials for one card.
 */
export async function ensurePass(
  client: SupabaseClient,
  member: { tenantId: string; programId: string; customerKey: string },
  newSerial: () => string,
): Promise<WalletPassRow> {
  const { error } = await client.from('loyalty_wallet_passes').upsert(
    {
      tenant_id: member.tenantId,
      program_id: member.programId,
      customer_key: member.customerKey,
      serial_number: newSerial(),
    },
    { onConflict: 'program_id,customer_key', ignoreDuplicates: true },
  )
  if (error) fail('create', error.message)

  const { data, error: readError } = await client
    .from('loyalty_wallet_passes')
    .select(PASS_SELECT)
    .eq('program_id', member.programId)
    .eq('customer_key', member.customerKey)
    .single()
  if (readError || !data) fail('create', readError?.message ?? 'row missing after insert')
  return data as WalletPassRow
}

/** Records what the card now shows; its time is Apple's "updated since" tag. */
export async function recordPassContent(client: SupabaseClient, passId: string, contentHash: string): Promise<string> {
  const updatedAt = new Date().toISOString()
  const { error } = await client
    .from('loyalty_wallet_passes')
    .update({ content_hash: contentHash, content_updated_at: updatedAt })
    .eq('id', passId)
  if (error) fail('update', error.message)
  return updatedAt
}

export async function recordWalletWatermark(
  client: SupabaseClient,
  passId: string,
  wallet: 'apple' | 'google',
  contentHash: string,
): Promise<void> {
  const column = wallet === 'apple' ? 'apple_pushed_hash' : 'google_synced_hash'
  const { error } = await client.from('loyalty_wallet_passes').update({ [column]: contentHash }).eq('id', passId)
  if (error) fail('update', error.message)
}

/** True when this device was not registered for the pass before. */
export async function registerAppleDevice(
  client: SupabaseClient,
  registration: { passId: string; deviceId: string; pushToken: string },
): Promise<boolean> {
  const { data: existing, error: readError } = await client
    .from('loyalty_wallet_apple_registrations')
    .select('pass_id')
    .eq('pass_id', registration.passId)
    .eq('device_library_id', registration.deviceId)
    .maybeSingle()
  if (readError) fail('register', readError.message)

  const { error } = await client.from('loyalty_wallet_apple_registrations').upsert(
    {
      pass_id: registration.passId,
      device_library_id: registration.deviceId,
      push_token: registration.pushToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_library_id,pass_id' },
  )
  if (error) fail('register', error.message)
  return !existing
}

export async function unregisterAppleDevice(client: SupabaseClient, passId: string, deviceId: string): Promise<void> {
  const { error } = await client
    .from('loyalty_wallet_apple_registrations')
    .delete()
    .eq('pass_id', passId)
    .eq('device_library_id', deviceId)
  if (error) fail('unregister', error.message)
}

export async function listApplePushTokens(client: SupabaseClient, passId: string): Promise<string[]> {
  const { data, error } = await client.from('loyalty_wallet_apple_registrations').select('push_token').eq('pass_id', passId)
  if (error) fail('list devices', error.message)
  return [...new Set(((data ?? []) as Array<{ push_token: string }>).map((row) => row.push_token))]
}

/** Devices Apple says no longer hold the pass (HTTP 410 from APNs). */
export async function forgetApplePushTokens(client: SupabaseClient, passId: string, tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return
  const { error } = await client
    .from('loyalty_wallet_apple_registrations')
    .delete()
    .eq('pass_id', passId)
    .in('push_token', [...tokens])
  if (error) fail('prune devices', error.message)
}

/** Serials registered on a device whose card changed after `since` (Apple's update tag). */
export async function listUpdatedSerials(
  client: SupabaseClient,
  deviceId: string,
  since: string | null,
): Promise<Array<{ serial: string; updatedAt: string }>> {
  const { data: registrations, error } = await client
    .from('loyalty_wallet_apple_registrations')
    .select('pass_id')
    .eq('device_library_id', deviceId)
    .limit(DEVICE_REGISTRATION_LIMIT)
  if (error) fail('list registrations', error.message)
  const passIds = ((registrations ?? []) as Array<{ pass_id: string }>).map((row) => row.pass_id)
  if (passIds.length === 0) return []

  let query = client.from('loyalty_wallet_passes').select('serial_number, content_updated_at').in('id', passIds)
  if (since) query = query.gt('content_updated_at', since)
  const { data, error: passError } = await query
  if (passError) fail('list updated', passError.message)
  return ((data ?? []) as Array<{ serial_number: string; content_updated_at: string }>).map((row) => ({
    serial: row.serial_number,
    updatedAt: row.content_updated_at,
  }))
}
