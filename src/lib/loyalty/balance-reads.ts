/**
 * The two ledger reads every customer-facing loyalty surface needs: how many
 * stamps a customer key holds, and how many rewards are sitting unused.
 *
 * Extracted so the receipt page and the phone lookup cannot drift apart — a
 * balance shown at checkout and the same balance shown on the receipt must come
 * from the same query, including the "not expired yet" rule on rewards.
 *
 * Service-role only: the ledger tables are read-only to admins under RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** The customer's balance for one program, or null when they have no row yet. */
export async function readLoyaltyBalance(
  client: SupabaseClient,
  tenantId: string,
  programId: string,
  customerKey: string,
): Promise<number | null> {
  const { data, error } = await client
    .from('loyalty_balances')
    .select('balance')
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .eq('customer_key', customerKey)
    .maybeSingle()

  if (error) throw new Error(`loyalty balance could not be read: ${error.message}`)
  const balance = Number((data as { balance?: number } | null)?.balance)
  return Number.isFinite(balance) ? balance : null
}

/** Rewards the customer holds and can still use. */
export async function countAvailableLoyaltyRewards(
  client: SupabaseClient,
  tenantId: string,
  programId: string,
  customerKey: string,
): Promise<number> {
  const { count, error } = await client
    .from('loyalty_entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .eq('customer_key', customerKey)
    .eq('status', 'issued')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  if (error) throw new Error(`loyalty rewards could not be counted: ${error.message}`)
  return count ?? 0
}
