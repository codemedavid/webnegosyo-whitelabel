/**
 * Customer capture for orders that do NOT live in the platform Supabase project.
 *
 * The original capture path (`upsertCustomerFromOrder` + `createSupabaseCustomerStore`)
 * recomputes a profile from the orders LINKED to a customer via `orders.customer_id`.
 * That works only for platform-Supabase tenants. Convex-backed and
 * tenant-Supabase-backed tenants write their orders to a different database, so
 * their phone numbers never reached `customers` at all — the merchant's Regulars
 * list silently stopped growing the day they switched backends.
 *
 * Fix: keep one small platform-side ledger of the facts needed to derive a
 * profile (`customer_external_orders`), keyed by `(tenant, backend, external
 * order id)`. The ledger is the "orders" set for those customers, so the exact
 * same recompute-then-save orchestration applies unchanged — and stays
 * idempotent, because replaying an order upserts the same ledger row.
 *
 * The ledger is deliberately a port (`ExternalOrderLedger`) rather than direct
 * Supabase calls, so the orchestration is unit-testable with an in-memory fake.
 */
import {
  upsertCustomerFromOrder,
  type CustomerStore,
  type CustomerOrderFacts,
} from '@/lib/customers-service'
import type { CustomerIdentityInput, CustomerOrderItemInput } from '@/lib/customer-identity'

/** Which foreign backend an order came from. Part of the ledger's identity key. */
export type ExternalOrderBackend = 'convex' | 'tenant_supabase'

/** Everything needed to roll one externally-stored order into a customer profile. */
export interface ExternalOrderInput extends CustomerIdentityInput {
  backend: ExternalOrderBackend
  /** The order's id in its own backend (Convex document id / tenant Supabase uuid). */
  externalOrderId: string
  total: number
  /** ISO string or epoch milliseconds (Convex `_creationTime`). */
  createdAt: string | number
  channel?: string | null
  items?: CustomerOrderItemInput[]
}

/** A row of `public.customer_external_orders`. */
export interface ExternalLedgerRow {
  tenant_id: string
  customer_id: string
  backend: ExternalOrderBackend
  external_order_id: string
  total: number
  ordered_at: string
  channel: string | null
  items: CustomerOrderItemInput[]
  sms_consent: boolean
}

/** Storage port for the ledger, so the orchestration can be faked in tests. */
export interface ExternalOrderLedger {
  /** Insert or replace by (tenant_id, backend, external_order_id). */
  upsert(row: ExternalLedgerRow): Promise<void>
  /** Every ledger row for a customer, as aggregate inputs. */
  listByCustomer(customerId: string): Promise<CustomerOrderFacts[]>
}

/** The identity half of `CustomerStore` — shared verbatim with the Supabase store. */
export type CustomerIdentityStore = Pick<
  CustomerStore,
  'findCustomerId' | 'createCustomer' | 'saveCustomerProfile'
>

function toIso(value: string | number): string {
  const date = new Date(value)
  const ms = date.getTime()
  return Number.isNaN(ms) ? new Date(0).toISOString() : date.toISOString()
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** SMS opt-in rides inside the order's free-form customerData bag on every backend. */
function readSmsConsent(customerData: Record<string, unknown> | null | undefined): boolean {
  return customerData?.sms_consent === true
}

/** Map an external order onto its ledger row. Pure — the DB coercion boundary. */
export function buildExternalLedgerRow(
  tenantId: string,
  customerId: string,
  order: ExternalOrderInput
): ExternalLedgerRow {
  return {
    tenant_id: tenantId,
    customer_id: customerId,
    backend: order.backend,
    external_order_id: order.externalOrderId,
    total: toNumber(order.total),
    ordered_at: toIso(order.createdAt),
    channel: order.channel?.trim() || null,
    items: (order.items ?? []).filter((item) => Boolean(item?.name)),
    sms_consent: readSmsConsent(order.customerData),
  }
}

/** Map ledger rows back to the aggregate input shape. Pure. */
export function ledgerRowsToFacts(rows: ExternalLedgerRow[]): CustomerOrderFacts[] {
  return rows.map((row) => ({
    total: toNumber(row.total),
    createdAt: row.ordered_at,
    channel: row.channel,
    items: row.items ?? [],
    smsConsent: row.sms_consent === true,
  }))
}

/**
 * A `CustomerStore` whose "orders" are ledger rows instead of platform order rows.
 *
 * The store is built per-order because the ledger needs the order's facts at link
 * time — facts the `CustomerStore` port intentionally does not carry. Closing over
 * them here keeps the shared orchestration (and its tests) untouched.
 */
export function createExternalCustomerStore(
  identity: CustomerIdentityStore,
  ledger: ExternalOrderLedger,
  tenantId: string,
  order: ExternalOrderInput
): CustomerStore {
  return {
    findCustomerId: identity.findCustomerId.bind(identity),
    createCustomer: identity.createCustomer.bind(identity),
    saveCustomerProfile: identity.saveCustomerProfile.bind(identity),

    async linkOrderToCustomer(orderId, customerId) {
      await ledger.upsert(
        buildExternalLedgerRow(tenantId, customerId, { ...order, externalOrderId: orderId })
      )
    },

    async listCustomerOrders(customerId) {
      return ledger.listByCustomer(customerId)
    },
  }
}

/**
 * Roll one externally-stored order into its tenant's customer profile.
 * Returns the customer id, or `null` for anonymous / unidentifiable orders.
 */
export async function captureExternalOrderCustomer(
  identity: CustomerIdentityStore,
  ledger: ExternalOrderLedger,
  tenantId: string,
  order: ExternalOrderInput
): Promise<string | null> {
  const store = createExternalCustomerStore(identity, ledger, tenantId, order)
  return upsertCustomerFromOrder(store, tenantId, {
    orderId: order.externalOrderId,
    name: order.name ?? null,
    contact: order.contact ?? null,
    customerData: order.customerData ?? null,
  })
}

// ============================================================================
// Supabase-backed ledger (service role — bypasses RLS)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

/**
 * Build the service-role backed ledger. The caller owns the admin client so this
 * module stays free of server-only imports and the orchestration above remains
 * unit-testable.
 */
export function createSupabaseExternalOrderLedger(admin: AdminClient): ExternalOrderLedger {
  return {
    async upsert(row) {
      const { error } = await admin
        .from('customer_external_orders')
        .upsert(row, { onConflict: 'tenant_id,backend,external_order_id' })
      if (error) throw error
    },

    async listByCustomer(customerId) {
      const { data, error } = await admin
        .from('customer_external_orders')
        .select('tenant_id, customer_id, backend, external_order_id, total, ordered_at, channel, items, sms_consent')
        .eq('customer_id', customerId)
      if (error) throw error
      return ledgerRowsToFacts((data as ExternalLedgerRow[] | null) ?? [])
    },
  }
}

/**
 * Best-effort customer capture for an order that was just written to a foreign
 * backend. Wired into the Convex and tenant-Supabase checkout paths.
 *
 * Never throws: the order is already saved by the time this runs, so a customer
 * bookkeeping failure must not surface to the shopper. Failures are logged with
 * enough context to replay them (the capture is idempotent, so replay is safe).
 */
export async function captureExternalOrderBestEffort(
  admin: AdminClient,
  tenantId: string,
  order: ExternalOrderInput
): Promise<string | null> {
  try {
    const { createSupabaseCustomerStore } = await import('@/lib/customers-service')
    return await captureExternalOrderCustomer(
      createSupabaseCustomerStore(admin),
      createSupabaseExternalOrderLedger(admin),
      tenantId,
      order
    )
  } catch (error) {
    console.error(
      '[captureExternalOrder] customer capture failed (non-blocking):',
      error instanceof Error ? error.message : error,
      { tenantId, backend: order.backend, externalOrderId: order.externalOrderId }
    )
    return null
  }
}
