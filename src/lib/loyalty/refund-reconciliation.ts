import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createConvexServerClient } from '@/lib/convex/server'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import { resolveOrderBackend } from '@/lib/order-backend'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { earnLoyaltyForFact } from './apply'
import { createSupabaseLoyaltyDeps, loadLoyaltyOrderFact } from './store'
interface Evidence {
  status: string
  totalCentavos: number
  chargedCentavos: number
  refundedCentavos: number
}

export function isFullyRefundedRewardSale(
  value: unknown,
  originalTotal: number,
): boolean {
  if (!value || typeof value !== 'object') return false
  const evidence = value as Evidence
  if (
    ![
      evidence.totalCentavos,
      evidence.chargedCentavos,
      evidence.refundedCentavos,
      originalTotal,
    ].every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    return false
  if (originalTotal === 0)
    return (
      evidence.totalCentavos === 0 &&
      ['cancelled', 'canceled', 'voided', 'refunded'].includes(
        evidence.status,
      ) &&
      evidence.chargedCentavos === evidence.refundedCentavos
    )
  return (
    evidence.chargedCentavos >= originalTotal &&
    evidence.refundedCentavos >= evidence.chargedCentavos
  )
}

/** Scheduled authoritative reads repair missed handset lifecycle notifications. */
export async function reconcileLoyaltyRefunds(
  admin: SupabaseClient,
  limit = 5,
) {
  const { data: jobs, error } = await admin.rpc('claim_loyalty_refund_checks', {
    p_limit: limit,
  })
  if (error) throw new Error('Refund reconciliation queue unavailable')
  const outcome = { checked: 0, restored: 0, unconfirmed: 0 }
  for (const job of jobs ?? []) {
    try {
      const [
        { data: tenant, error: tenantError },
        { data: receipt, error: receiptError },
      ] = await Promise.all([
        admin
          .from('tenants')
          .select(
            'order_backend,convex_deployment_url,supabase_order_url,supabase_order_service_key',
          )
          .eq('id', job.tenant_id)
          .maybeSingle(),
        admin
          .from('loyalty_pos_settlements')
          .select('total_centavos')
          .eq('tenant_id', job.tenant_id)
          .eq('id', job.settlement_id)
          .maybeSingle(),
      ])
      if (tenantError || receiptError || !tenant || !receipt)
        throw new Error('Refund context unavailable')
      const backend = resolveOrderBackend(tenant)
      const expected =
        job.order_backend === 'platform_supabase'
          ? 'platform'
          : job.order_backend === 'convex'
            ? 'convex'
            : 'supabase'
      if (backend !== expected) throw new Error('Order backend changed')
      let evidence: unknown
      if (backend === 'convex') {
        const secrets = await getTenantSecrets(admin, job.tenant_id)
        if (!tenant.convex_deployment_url || !secrets?.convex_deploy_key)
          throw new Error('Missing backend credentials')
        evidence = await createConvexServerClient(
          tenant.convex_deployment_url,
          secrets.convex_deploy_key,
        ).query('loyalty:refundEvidenceInternal', {
          settlementId: job.settlement_id,
        })
      } else {
        const destination =
          backend === 'platform' ? admin : createTenantOrderWriteClient(tenant)
        const result = await destination.rpc('read_loyalty_refund_evidence', {
          p_tenant_id: job.tenant_id,
          p_settlement_id: job.settlement_id,
        })
        if (result.error) throw new Error('Refund evidence unavailable')
        evidence = result.data
      }
      if (isFullyRefundedRewardSale(evidence, Number(receipt.total_centavos))) {
        const fact = await loadLoyaltyOrderFact(admin, {
          tenantId: job.tenant_id,
          backend: job.order_backend,
          externalOrderId: job.external_order_id,
        })
        if (!fact) throw new Error('Refund order facts unavailable')
        await earnLoyaltyForFact(
          { ...fact, status: 'refunded' },
          { tenantId: job.tenant_id, isShadow: false },
          createSupabaseLoyaltyDeps(admin),
        )
        const result = await admin.rpc('restore_loyalty_refunded_receipt', {
          p_tenant_id: job.tenant_id,
          p_settlement_id: job.settlement_id,
        })
        if (result.error) throw new Error('Refund restoration unconfirmed')
        if (result.data === true) outcome.restored++
      }
      outcome.checked++
    } catch {
      outcome.unconfirmed++
    }
  }
  return outcome
}
