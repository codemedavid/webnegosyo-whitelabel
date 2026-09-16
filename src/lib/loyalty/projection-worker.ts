import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createConvexServerClient } from '@/lib/convex/server'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import { resolveOrderBackend } from '@/lib/order-backend'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import {
  createSupabaseCustomerStore,
  upsertCustomerFromOrder,
} from '@/lib/customers-service'
import {
  captureExternalOrderCustomer,
  createSupabaseExternalOrderLedger,
} from '@/lib/customer-external-orders'
import { earnLoyaltyForFact } from './apply'
import { parseLoyaltyRules } from './rules'
import { createSupabaseLoyaltyDeps, loadLoyaltyOrderFact } from './store'
const money = z.number().int().nonnegative().max(999999999)
const snapshotSchema = z.object({
  earningPrograms: z.array(
    z.object({
      id: z.string().uuid(),
      tenantId: z.string().uuid(),
      name: z.string(),
      scope: z.enum(['business', 'branch']),
      outletId: z.string().uuid().nullable(),
      status: z.literal('active'),
      activatesAt: z.string().nullable(),
      endsAt: z.string().nullable(),
      version: z.object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        rules: z.unknown(),
        createdAt: z.string(),
      }),
    }),
  ),
  version: z.literal(1),
  outletId: z.string().uuid().nullable(),
  orderTypeId: z.string().uuid(),
  orderTypeName: z.string(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        name: z.string(),
        quantity: z.number().int().positive(),
        unitPriceCentavos: money,
        subtotalCentavos: money,
        baseUnitPriceCentavos: money,
        selectedOptions: z.array(
          z.object({
            groupName: z.string(),
            name: z.string(),
            priceModifierCentavos: money,
          }),
        ),
      }),
    )
    .min(1),
  totals: z.object({
    subtotalCentavos: money,
    discountCentavos: money,
    grandTotalCentavos: money,
  }),
  discount: z.object({
    label: z.string(),
    loyaltyProgramId: z.string(),
    amountCentavos: money,
  }),
  paymentMethods: z.array(z.object({ id: z.string(), name: z.string() })),
})
interface ProjectionJob {
  id: string
  tenant_id: string
  settlement_id: string
  order_backend: 'platform_supabase' | 'convex' | 'tenant_supabase'
  lease_token: string
}

/** Single batch; durable database leases own retries and stale acknowledgements. */
export async function projectLoyaltyReceipts(
  admin: SupabaseClient,
  limit = 10,
) {
  const { data: jobs, error } = await admin.rpc(
    'claim_loyalty_pos_projections',
    { p_limit: limit },
  )
  if (error) throw new Error('Projection queue unavailable')
  const outcome = { completed: 0, retried: 0, unconfirmed: 0 }
  for (const job of (jobs ?? []) as ProjectionJob[]) {
    let externalId: string | null = null
    let failed = false
    try {
      externalId = await projectOne(admin, job)
    } catch {
      failed = true
    }
    const { data: ack, error: ackError } = await admin.rpc(
      'finish_loyalty_pos_projection',
      {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_external_order_id: externalId,
        p_error: failed
          ? 'Sale projection or customer reconciliation failed.'
          : null,
      },
    )
    if (ackError || ack !== true) outcome.unconfirmed++
    else if (failed) outcome.retried++
    else outcome.completed++
  }
  return outcome
}
async function projectOne(
  admin: SupabaseClient,
  job: ProjectionJob,
): Promise<string> {
  const { data: receipt, error: receiptError } = await admin
    .from('loyalty_pos_settlements')
    .select('*')
    .eq('tenant_id', job.tenant_id)
    .eq('id', job.settlement_id)
    .maybeSingle()
  if (receiptError || !receipt) throw new Error('Receipt unavailable')
  const [quote, tenant] = await Promise.all([
    admin
      .from('loyalty_pos_quotes')
      .select('customer_key')
      .eq('tenant_id', job.tenant_id)
      .eq('id', receipt.quote_id)
      .maybeSingle(),
    admin
      .from('tenants')
      .select(
        'order_backend,convex_deployment_url,supabase_order_url,supabase_order_service_key',
      )
      .eq('id', job.tenant_id)
      .maybeSingle(),
  ])
  if (quote.error || tenant.error || !quote.data || !tenant.data)
    throw new Error('Projection context unavailable')
  const snapshot = snapshotSchema.parse(receipt.order_snapshot)
  const total = Number(receipt.total_centavos)
  if (
    total !== snapshot.totals.grandTotalCentavos ||
    snapshot.items.reduce((sum, line) => sum + line.subtotalCentavos, 0) !==
      snapshot.totals.subtotalCentavos ||
    snapshot.totals.subtotalCentavos - snapshot.totals.discountCentavos !==
      total
  )
    throw new Error('Invalid receipt totals')
  const phone = String(quote.data.customer_key).replace(/^phone:/, '')
  if (!/^\+639[0-9]{9}$/.test(phone))
    throw new Error('Invalid customer identity')
  const paymentMethodName = snapshot.paymentMethods.find(
    (method) => method.id === receipt.payment.methodId,
  )?.name
  if (!paymentMethodName) throw new Error('Invalid receipt payment')
  const customerData = {
    outlet_id: snapshot.outletId,
    loyaltySettlementId: receipt.id,
    loyaltySettledAt: receipt.settled_at,
    discount: {
      total: snapshot.discount.amountCentavos / 100,
      deliveryDiscount: 0,
      lines: [
        {
          kind: 'loyalty',
          label: snapshot.discount.label,
          amount: snapshot.discount.amountCentavos / 100,
          loyaltyProgramId: snapshot.discount.loyaltyProgramId,
        },
      ],
    },
    pos: {
      reference: receipt.payment.reference,
      cashierId: receipt.cashier_id,
      ...(receipt.payment.kind === 'cash'
        ? {
            cashTendered: receipt.payment.amountTenderedCentavos / 100,
            changeDue: receipt.payment.changeCentavos / 100,
          }
        : {}),
    },
  }
  const document = {
    source: 'pos',
    phone,
    totalCentavos: total,
    customerData,
    outletId: snapshot.outletId,
    orderTypeId: snapshot.orderTypeId,
    orderTypeName: snapshot.orderTypeName,
    payment: receipt.payment,
    paymentMethodName,
    cashierId: receipt.cashier_id,
    settledAt: receipt.settled_at,
    items: snapshot.items.map((item) => ({
      ...item,
      variation: item.selectedOptions
        .map((option) => `${option.groupName}: ${option.name}`)
        .join(', '),
    })),
  }
  const resolved = resolveOrderBackend(tenant.data)
  const expected =
    job.order_backend === 'platform_supabase'
      ? 'platform'
      : job.order_backend === 'tenant_supabase'
        ? 'supabase'
        : 'convex'
  if (resolved !== expected)
    throw new Error('Order backend changed during projection')
  let externalId: string
  if (expected === 'convex') {
    const secrets = await getTenantSecrets(admin, job.tenant_id)
    if (!tenant.data.convex_deployment_url || !secrets?.convex_deploy_key)
      throw new Error('Missing Convex credentials')
    externalId = await createConvexServerClient(
      tenant.data.convex_deployment_url,
      secrets.convex_deploy_key,
    ).mutation<string>('loyalty:projectReceiptInternal', {
      settlementId: receipt.id,
      receipt: document,
      receiptHash: createHash('sha256')
        .update(JSON.stringify(document))
        .digest('hex'),
    })
  } else {
    const destination =
      expected === 'platform'
        ? admin
        : createTenantOrderWriteClient(tenant.data)
    const { data, error } = await destination.rpc(
      'project_loyalty_pos_receipt',
      {
        p_tenant_id: job.tenant_id,
        p_settlement_id: receipt.id,
        p_receipt: document,
      },
    )
    if (error || typeof data !== 'string')
      throw new Error('Order projection failed')
    externalId = data
  }
  // Destination creation may already have committed. Any later failure retries
  // this same receipt; the destination returns its existing paid order.
  const identity = createSupabaseCustomerStore(admin)
  const customerId =
    job.order_backend === 'platform_supabase'
      ? await upsertCustomerFromOrder(identity, job.tenant_id, {
          orderId: externalId,
          contact: phone,
        })
      : await captureExternalOrderCustomer(
          identity,
          createSupabaseExternalOrderLedger(admin),
          job.tenant_id,
          {
            backend: job.order_backend,
            externalOrderId: externalId,
            contact: phone,
            total: total / 100,
            createdAt: receipt.settled_at,
            channel: 'pos',
            customerData,
            items: snapshot.items.map((item) => ({
              menuItemId: item.menuItemId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPriceCentavos / 100,
            })),
          },
        )
  if (!customerId) throw new Error('Customer reconciliation unconfirmed')
  if (job.order_backend !== 'platform_supabase') {
    const { error } = await admin
      .from('customer_external_orders')
      .update({
        status: 'confirmed',
        payment_status: 'paid',
        source: 'pos',
        outlet_id: snapshot.outletId,
        completed_at: receipt.settled_at,
        updated_at: receipt.settled_at,
      })
      .eq('tenant_id', job.tenant_id)
      .eq('backend', job.order_backend)
      .eq('external_order_id', externalId)
      .is('completed_at', null)
      .or('status.is.null,status.eq.pending,status.eq.confirmed')
      .or(
        'payment_status.is.null,payment_status.eq.pending,payment_status.eq.paid',
      )
    if (error) throw new Error('Customer lifecycle reconciliation failed')
  }
  const fact = await loadLoyaltyOrderFact(admin, {
    tenantId: job.tenant_id,
    backend: job.order_backend,
    externalOrderId: externalId,
  })
  if (!fact) throw new Error('Projected customer facts unavailable')
  const programs = snapshot.earningPrograms.map((program) => {
    if (program.tenantId !== job.tenant_id)
      throw new Error('Invalid earning tenant')
    const rules = parseLoyaltyRules(program.version.rules)
    if (!rules.ok) throw new Error('Invalid earning snapshot')
    return { ...program, version: { ...program.version, rules: rules.value } }
  })
  await earnLoyaltyForFact(
    { ...fact, completedAt: receipt.settled_at },
    { tenantId: job.tenant_id, isShadow: false },
    {
      ...createSupabaseLoyaltyDeps(admin),
      loadActivePrograms: async () => programs,
    },
  )
  return externalId
}
