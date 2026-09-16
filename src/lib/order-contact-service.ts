import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { verifyTrackingToken } from '@/lib/tracking-token'
import { decideContactWrite, type ContactSubmission } from '@/lib/order-contact'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
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
  /** The order is finished — a receipt found afterwards claims nothing. */
  | 'claim_closed'
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
      .select('order_backend, convex_deployment_url')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    const config = tenantConfig as OrderBackendTenantFields | null

    if (!config) return { ok: false, error: 'not_found' }

    // Same resolver checkout writes through. Routing on the credentials alone
    // ignores a deliberate `order_backend` pin, which sent the number to a
    // database the order was never written to — see
    // tests/unit/order-contact-backend-routing.test.ts.
    if (resolveOrderBackend(config) === 'convex') {
      const deployKey = (await getTenantSecrets(supabaseAdmin, tenantId))?.convex_deploy_key
      if (!config.convex_deployment_url || !deployKey) return { ok: false, error: 'unavailable' }
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
  const order = await convex.query<any>('orders:getOrderByIdInternal', {
    orderId: submission.orderId,
  })
  if (!order) return { ok: false, error: 'not_found' }

  const decision = decideContactWrite(
    { contact: order.customerContact, name: order.customerName, status: order.status },
    submission,
  )
  if (!decision.ok) return decision

  try {
    await convex.mutation('orders:updateCustomerContactInternal', {
      orderId: submission.orderId,
      contact: decision.contact,
      ...(decision.name ? { name: decision.name } : {}),
    })

    // A walk-in Convex order identifies nobody, so nothing ever projected it
    // into the platform-side customer ledger — and loyalty can only read that
    // ledger. The number the customer just gave is what makes the projection
    // possible, so it happens here, service-role, rather than waiting for a
    // merchant session that may never come.
    const loyalty = await projectAndEarnConvexOrder(submission, order, decision.contact, decision.name)
    return { ok: true, loyalty }
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
    .select('id, customer_contact, customer_name, status')
    .eq('id', submission.orderId)
    .eq('tenant_id', submission.tenantId)
    .maybeSingle()

  const existing = order as {
    id: string
    customer_contact?: string | null
    customer_name?: string | null
    status?: string | null
  } | null
  if (!existing) return { ok: false, error: 'not_found' }

  const decision = decideContactWrite(
    { contact: existing.customer_contact, name: existing.customer_name, status: existing.status },
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

interface ConvexOrderFacts {
  status?: string | null
  total?: number | null
  orderType?: string | null
  _creationTime?: number | null
  customerData?: Record<string, unknown> | null
  items?: Array<{ menuItemName?: string | null; name?: string | null; quantity?: number | null }> | null
}

/**
 * Project a Convex order into the platform customer ledger under the number
 * the customer just gave, then run earning for it.
 *
 * The projection is what makes the stamp possible at all: `runLoyaltyForOrder`
 * reads `customer_external_orders` for a Convex store, and a walk-in order
 * never wrote a row there. Earning still refuses until the order is completed
 * — the merchant app's lifecycle sync brings that news — so the honest answer
 * here is usually `pending`.
 */
async function projectAndEarnConvexOrder(
  submission: ContactSubmission,
  order: ConvexOrderFacts,
  contact: string,
  name: string | undefined,
): Promise<ContactEarningSummary> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    const { captureExternalOrderBestEffort } = await import('@/lib/customer-external-orders')
    const customerId = await captureExternalOrderBestEffort(admin, submission.tenantId, {
      backend: 'convex',
      externalOrderId: submission.orderId,
      name: name ?? null,
      contact,
      customerData: (order.customerData ?? null) as Record<string, unknown> | null,
      total: Number(order.total) || 0,
      createdAt: order._creationTime ?? new Date().toISOString(),
      channel: order.orderType ?? null,
      items: (order.items ?? []).map((item) => ({
        name: (item?.menuItemName ?? item?.name ?? '').toString(),
        quantity: Number(item?.quantity) || 0,
      })),
    })
    // No customer means the number could not be resolved to an identity; there
    // is no ledger row to earn against and nothing to promise.
    if (!customerId) return ATTACHED_ONLY

    return await runLoyaltyAfterAttach(admin, submission, 'convex')
  } catch (err) {
    console.error(
      '[Order Contact] Convex loyalty projection failed:',
      err instanceof Error ? err.message : err,
    )
    return ATTACHED_ONLY
  }
}

async function runLoyaltyAfterAttach(
  supabase: ReturnType<typeof createAdminClient>,
  submission: ContactSubmission,
  backend: 'platform_supabase' | 'convex' = 'platform_supabase',
): Promise<ContactEarningSummary> {
  try {
    const { runLoyaltyForOrder } = await import('@/lib/loyalty/lifecycle')
    const result = await runLoyaltyForOrder(supabase, {
      tenantId: submission.tenantId,
      backend,
      externalOrderId: submission.orderId,
    })
    return summarizeContactEarning(result)
  } catch (err) {
    // The number is saved either way; the stamp is retried by the next event.
    console.error('[Order Contact] Loyalty after attach failed:', err instanceof Error ? err.message : err)
    return ATTACHED_ONLY
  }
}
