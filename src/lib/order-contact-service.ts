import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { verifyTrackingToken } from '@/lib/tracking-token'
import { decideContactWrite, type ContactSubmission } from '@/lib/order-contact'
import { summarizeContactEarning, type ContactEarningSummary } from '@/lib/loyalty/contact-earning'

/**
 * Attach a contact to an order after the fact (receipt-QR capture).
 *
 * Same shape as order-tracking-service: token first, then Convex or platform
 * Supabase depending on the tenant row. The once-only rule is enforced here
 * against the order's current state (and again inside the Convex mutation —
 * the platform update also carries it in its WHERE clause) so two concurrent
 * submissions cannot both land.
 */

export type ContactUpdateError =
  | 'invalid_token'
  | 'not_found'
  | 'already_set'
  | 'unavailable'

export type ContactUpdateResult =
  | { ok: true; loyalty: ContactEarningSummary }
  | { ok: false; error: ContactUpdateError }

/** The number is on the order; no stamp claim is made. */
const ATTACHED_ONLY: ContactEarningSummary = { state: 'attached' }

export async function updateOrderContact(
  submission: ContactSubmission,
): Promise<ContactUpdateResult> {
  const { orderId, tenantId, token } = submission

  if (!verifyTrackingToken(orderId, token)) {
    return { ok: false, error: 'invalid_token' }
  }

  try {
    const supabaseAdmin = createAdminClient()

    const { data: tenantConfig } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    const config = tenantConfig as { convex_deployment_url?: string | null } | null

    if (!config) return { ok: false, error: 'not_found' }

    const deployKey = config.convex_deployment_url
      ? (await getTenantSecrets(supabaseAdmin, tenantId))?.convex_deploy_key
      : null

    if (config.convex_deployment_url && deployKey) {
      return updateInConvex(config.convex_deployment_url, deployKey, submission)
    }
    return updateInSupabase(supabaseAdmin, submission)
  } catch (err) {
    console.error('[Order Contact] Error:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}

async function updateInConvex(
  convexUrl: string,
  convexKey: string,
  submission: ContactSubmission,
): Promise<ContactUpdateResult> {
  const convex = createConvexServerClient(convexUrl, convexKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = await convex.query<any>('orders:getOrderById', {
    orderId: submission.orderId,
  })
  if (!order) return { ok: false, error: 'not_found' }

  const decision = decideContactWrite(
    { contact: order.customerContact, name: order.customerName },
    submission,
  )
  if (!decision.ok) return decision

  try {
    await convex.mutation('orders:updateCustomerContact', {
      orderId: submission.orderId,
      contact: decision.contact,
      ...(decision.name ? { name: decision.name } : {}),
    })
    // The Convex order's customer ledger row was projected at order create,
    // before this number existed, and the capture route that re-projects it
    // needs a merchant session. Earning for a late-attached number on a Convex
    // store therefore waits for the next lifecycle sync — so no stamp is
    // claimed here.
    return { ok: true, loyalty: ATTACHED_ONLY }
  } catch (err) {
    // Deployments that predate the mutation reject it — the capture is simply
    // unavailable for that store until its Convex bundle is redeployed.
    console.error('[Order Contact] Convex mutation failed:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}

async function updateInSupabase(
  supabase: ReturnType<typeof createAdminClient>,
  submission: ContactSubmission,
): Promise<ContactUpdateResult> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_contact, customer_name')
    .eq('id', submission.orderId)
    .eq('tenant_id', submission.tenantId)
    .maybeSingle()

  const existing = order as {
    id: string
    customer_contact?: string | null
    customer_name?: string | null
  } | null
  if (!existing) return { ok: false, error: 'not_found' }

  const decision = decideContactWrite(
    { contact: existing.customer_contact, name: existing.customer_name },
    submission,
  )
  if (!decision.ok) return decision

  const { error } = await supabase
    .from('orders')
    .update({
      customer_contact: decision.contact,
      ...(decision.name ? { customer_name: decision.name } : {}),
    })
    .eq('id', submission.orderId)
    .eq('tenant_id', submission.tenantId)

  if (error) return { ok: false, error: 'unavailable' }

  // A counter sale is usually already settled when the customer scans the
  // receipt, so the completion event ran with no phone and earned nothing.
  // This is the first moment the order can earn; the write is idempotent, so
  // an order that already earned costs one query and never a second stamp.
  const loyalty = await runLoyaltyAfterAttach(supabase, submission)
  return { ok: true, loyalty }
}

async function runLoyaltyAfterAttach(
  supabase: ReturnType<typeof createAdminClient>,
  submission: ContactSubmission,
): Promise<ContactEarningSummary> {
  try {
    const { runLoyaltyForOrder } = await import('@/lib/loyalty/lifecycle')
    const result = await runLoyaltyForOrder(supabase, {
      tenantId: submission.tenantId,
      backend: 'platform_supabase',
      externalOrderId: submission.orderId,
    })
    return summarizeContactEarning(result)
  } catch (err) {
    // The number is saved either way; the stamp is retried by the next event.
    console.error('[Order Contact] Loyalty after attach failed:', err instanceof Error ? err.message : err)
    return ATTACHED_ONLY
  }
}
