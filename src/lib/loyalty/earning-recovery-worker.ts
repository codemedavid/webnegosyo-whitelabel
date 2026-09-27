import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOrderTrackingContext } from '@/lib/order-tracking-service'
import { generateTrackingToken } from '@/lib/tracking-token'
import { syncOrderLifecycle } from '@/lib/customer-lifecycle-sync'
import { createSupabaseLifecycleDeps } from '@/lib/customer-lifecycle-store'
import { recoverLoyaltyOrder, type EarningRecoveryDeps } from './earning-recovery'
import { createSupabaseLoyaltyDeps, loadLoyaltyOrderFact, loadLoyaltyProgramsAt, loadLoyaltyTenantFlags, type LoyaltyOrderRef } from './store'

export function createEarningRecoveryDeps(admin: SupabaseClient): EarningRecoveryDeps {
  return {
    loadFlags: tenantId => loadLoyaltyTenantFlags(admin, tenantId),
    loadFact: ref => loadLoyaltyOrderFact(admin, ref),
    loadPrograms: (tenantId, at) => loadLoyaltyProgramsAt(admin, tenantId, at),
    earning: createSupabaseLoyaltyDeps(admin),
    async refreshSource(ref) {
      const before = await loadLoyaltyOrderFact(admin, ref)
      if (!before) throw new Error('Order projection is missing')
      // Platform updated_at is mutable and is not evidence of completion time.
      if (ref.backend === 'platform_supabase') return before.orderedAt
      const { data } = await fetchOrderTrackingContext(ref.externalOrderId, generateTrackingToken(ref.externalOrderId), ref.tenantId)
      if (!data || data.loyaltyIdentity.backend !== ref.backend) throw new Error('Order source could not be confirmed')
      const identity = data.loyaltyIdentity
      if (before.phoneE164 && identity.customerKey !== `phone:${before.phoneE164}`) {
        throw new Error('Order identity requires review')
      }
      await syncOrderLifecycle({ ...ref, status: data.status, paymentStatus: identity.paymentStatus,
        source: identity.source, outletId: identity.outletId, updatedAt: identity.observedAt,
      }, createSupabaseLifecycleDeps(admin))
      // Legacy external orders do not expose a completion timestamp. Recover
      // only under rules already in place at ordering, never a later offer.
      // Keep this cutoff on EVERY replay. Syncing the projection supplies a
      // completion timestamp, but does not turn it into historical evidence.
      return data.createdAt
    },
  }
}

interface RecoveryJob {
  id: string
  tenant_id: string
  backend: LoyaltyOrderRef['backend']
  external_order_id: string
  revision: number
  lease_token: string
}

export async function processLoyaltyEarningRecovery(admin: SupabaseClient, limit = 5) {
  const { data, error } = await admin.rpc('claim_loyalty_earning_jobs', { p_limit: limit })
  if (error) throw new Error('Loyalty recovery queue unavailable')
  const deps = createEarningRecoveryDeps(admin)
  const results = await Promise.all(((data ?? []) as RecoveryJob[]).map(async job => {
    let result: Awaited<ReturnType<typeof recoverLoyaltyOrder>> | 'failed'
    try {
      result = await recoverLoyaltyOrder({ tenantId: job.tenant_id, backend: job.backend, externalOrderId: job.external_order_id }, deps)
    } catch {
      // Persist a safe status. Secrets, phones and backend error payloads never
      // become customer-visible logs. The next lease retries with backoff.
      result = 'failed'
    }
    const { data: acknowledged, error: finishError } = await admin.rpc('finish_loyalty_earning_job', {
      p_id: job.id, p_lease: job.lease_token, p_revision: job.revision, p_result: result,
    })
    return finishError ? 'unconfirmed' : acknowledged ? result : 'superseded'
  }))
  return { checked: results.length, credited: results.filter(result => result === 'credited').length,
    failed: results.filter(result => result === 'failed' || result === 'unconfirmed').length,
    pending: results.filter(result => result === 'pending' || result === 'superseded').length }
}
