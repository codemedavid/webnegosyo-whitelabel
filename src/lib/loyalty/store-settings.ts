// Per-store loyalty switches that are not program rules. Today: whether the
// public rewards page texts a code before it shows anything.
//
// Service role only (the table grants nothing to anon/authenticated). A store
// with no row has every switch off.
import 'server-only'

interface SettingsRow {
  wallet_otp_required: boolean
}

// Minimal structural client: the table is newer than the generated types.
export interface StoreSettingsClient {
  from(table: 'loyalty_store_settings'): {
    select(columns: 'wallet_otp_required'): {
      eq(column: 'tenant_id', value: string): {
        maybeSingle(): PromiseLike<{ data: SettingsRow | null; error: unknown }>
      }
    }
    upsert(
      row: { tenant_id: string; wallet_otp_required: boolean; updated_at: string },
      options: { onConflict: 'tenant_id' },
    ): PromiseLike<{ error: unknown }>
  }
}

/** Throws when unreadable: callers decide which way to fail. */
export async function readWalletOtpRequired(client: StoreSettingsClient, tenantId: string): Promise<boolean> {
  const { data, error } = await client.from('loyalty_store_settings')
    .select('wallet_otp_required').eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error('Loyalty store settings unavailable')
  return data?.wallet_otp_required === true
}

export async function setWalletOtpRequired(client: StoreSettingsClient, tenantId: string, required: boolean): Promise<void> {
  const { error } = await client.from('loyalty_store_settings').upsert(
    { tenant_id: tenantId, wallet_otp_required: required, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id' },
  )
  if (error) throw new Error('Loyalty store settings not saved')
}
