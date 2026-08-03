/**
 * Reading and writing subscriptions against platform Supabase.
 *
 * The Supabase half of `subscription-service.ts`, kept apart so the arithmetic
 * stays unit-testable against an in-memory fake. Same seam as
 * `supabase-outlet-repository.ts`.
 *
 * Which client each function takes is deliberate:
 *  - READS use the caller's cookie-scoped client, so RLS confines a merchant to
 *    their own bill.
 *  - The WRITE store is built over the service-role client, because only a
 *    superadmin action constructs it and the RLS write policy is superadmin-only
 *    anyway. The authorization check lives in the action, read from the session
 *    — never from an argument.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PaymentRow, SubscriptionRow, SubscriptionStore } from '@/lib/billing/subscription-service'
import type { SubscriptionRecord } from '@/lib/billing/subscription-status'

/**
 * Columns the gate reads.
 *
 * Spelled out rather than `*` for the reason the outlet and storefront reads
 * are: a column the code reads but the query never selects arrives as
 * `undefined`, and an undefined `paid_through` reads as "no due date" — which
 * opens the gate for every tenant at once. This platform has shipped that class
 * of bug twice.
 */
export const SUBSCRIPTION_SELECT =
  'tenant_id, status, monthly_price_php, paid_through, grace_days, billing_anchor_date'

/**
 * Either Supabase client this module is handed: the cookie-scoped one for
 * reads (so RLS confines a merchant to their own bill) or the service-role one
 * for the superadmin write path.
 */
type BillingClient = SupabaseClient<Database>

/**
 * One tenant's subscription, or null.
 *
 * Null on ANY failure, including a query error. The caller treats null as
 * "not blocked", so a database blip leaves merchants working rather than
 * locking out the entire platform at once.
 */
export async function fetchSubscription(
  supabase: BillingClient,
  tenantId: string
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) return null
  return (data as SubscriptionRecord | null) ?? null
}

/** The write store `markPaid` runs against. Service-role client only. */
export function createSupabaseSubscriptionStore(supabase: BillingClient): SubscriptionStore {
  return {
    async getSubscription(tenantId: string): Promise<SubscriptionRow | null> {
      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select(SUBSCRIPTION_SELECT)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (error) throw new Error(`Could not read the subscription: ${error.message}`)
      return (data as SubscriptionRow | null) ?? null
    },

    async upsertSubscription(tenantId: string, patch: Partial<SubscriptionRow>): Promise<void> {
      const { error } = await supabase
        .from('tenant_subscriptions')
        .upsert({ tenant_id: tenantId, ...patch, updated_at: new Date().toISOString() })

      if (error) throw new Error(`Could not update the subscription: ${error.message}`)
    },

    async insertPayment(row: PaymentRow): Promise<void> {
      const { error } = await supabase.from('subscription_payments').insert(row)

      // Thrown, never swallowed: `markPaid` relies on this failing to abort
      // before it extends access. A silent failure here would grant a month
      // nobody has a record of paying for.
      if (error) throw new Error(`Could not record the payment: ${error.message}`)
    },
  }
}
