/**
 * Customer identity persistence (web / Supabase side).
 *
 * Three responsibilities:
 *   1. `upsertCustomerFromOrder` — the going-forward capture. Pure orchestration
 *      over a `CustomerStore` port: resolve identity → find-or-create the customer
 *      → link the order → recompute the profile from ALL linked orders → save.
 *      Recompute-then-save (never increment) makes it idempotent by construction,
 *      so replaying an order or re-running the backfill never double-counts.
 *   2. `createSupabaseCustomerStore` — the service-role backed implementation of
 *      that port. `customers` is PII, so writes go through the admin client (RLS
 *      bypass) since the going-forward upsert runs in the anonymous checkout path.
 *   3. `getCustomersByTenant` / `getCustomerDetail` — admin-scoped reads for the
 *      owner's "Regulars" list. These use the normal RLS client + admin check.
 *
 * Phone normalization is NOT done here — it lives in the shared, tested
 * `resolveCustomerIdentity` (src/lib/customer-identity.ts → src/lib/phone.ts).
 */

import {
  resolveCustomerIdentity,
  computeCustomerAggregate,
  type CustomerIdentityInput,
  type CustomerOrderInput,
  type CustomerOrderItemInput,
} from '@/lib/customer-identity'
import type { Customer } from '@/types/database'
import type { CustomersPagination } from '@/lib/customers-pagination'

/** Facts about a single order the aggregate is computed from. */
export interface CustomerOrderFacts {
  total: number
  /** ISO string or epoch milliseconds. */
  createdAt: string | number
  channel?: string | null
  items?: CustomerOrderItemInput[]
  smsConsent?: boolean
}

/** Identity + link inputs for the order that triggered the upsert. */
export interface UpsertCustomerInput extends CustomerIdentityInput {
  /** Id of the already-inserted order row to link to the resolved customer. */
  orderId: string
}

/** Fields needed to create a customer shell before its profile is computed. */
export interface NewCustomerInput {
  tenantId: string
  phoneE164: string | null
  email: string | null
  name: string | null
}

/** The recomputed, storable profile written back to a customer row. */
export interface CustomerProfilePatch {
  name: string | null
  phoneE164: string | null
  email: string | null
  orderCount: number
  totalSpent: number
  averageOrderValue: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  channelsUsed: string[]
  topItems: CustomerOrderItemInput[]
  smsConsent: boolean
  smsConsentAt: string | null
}

/**
 * Data-access port for customer persistence. Kept minimal and storage-agnostic so
 * the orchestration is unit-testable with an in-memory fake and reusable by the
 * backfill script.
 */
export interface CustomerStore {
  /** Find an existing customer id by identity: phone first, email fallback. */
  findCustomerId(tenantId: string, phoneE164: string | null, email: string | null): Promise<string | null>
  /** Create a customer shell and return its id. */
  createCustomer(input: NewCustomerInput): Promise<string>
  /** Persist the recomputed profile onto a customer row. */
  saveCustomerProfile(customerId: string, patch: CustomerProfilePatch): Promise<void>
  /** Link an order to a customer. Must be a no-op if already linked. */
  linkOrderToCustomer(orderId: string, customerId: string): Promise<void>
  /** All orders currently linked to this customer, as aggregate inputs. */
  listCustomerOrders(customerId: string): Promise<CustomerOrderFacts[]>
}

/**
 * Roll a single (already-inserted) order into its per-tenant customer profile.
 * Returns the customer id, or `null` when the order is anonymous / unidentifiable
 * (walk-in, blank, or malformed contact) — those never become customers.
 *
 * Idempotent: safe to call twice for the same order, and safe to interleave with
 * the backfill, because the profile is always recomputed from the full linked set.
 */
export async function upsertCustomerFromOrder(
  store: CustomerStore,
  tenantId: string,
  input: UpsertCustomerInput
): Promise<string | null> {
  const identity = resolveCustomerIdentity(input)
  if (!identity.identityKey) return null

  let customerId = await store.findCustomerId(tenantId, identity.phoneE164, identity.email)
  if (!customerId) {
    customerId = await store.createCustomer({
      tenantId,
      phoneE164: identity.phoneE164,
      email: identity.email,
      name: identity.name,
    })
  }

  await store.linkOrderToCustomer(input.orderId, customerId)

  const orders = await store.listCustomerOrders(customerId)
  const aggregate = computeCustomerAggregate(orders as CustomerOrderInput[])

  await store.saveCustomerProfile(customerId, {
    name: identity.name,
    phoneE164: identity.phoneE164,
    email: identity.email,
    orderCount: aggregate.orderCount,
    totalSpent: aggregate.totalSpent,
    averageOrderValue: aggregate.averageOrderValue,
    firstOrderAt: aggregate.firstOrderAt,
    lastOrderAt: aggregate.lastOrderAt,
    channelsUsed: aggregate.channelsUsed,
    topItems: aggregate.topItems,
    smsConsent: aggregate.smsConsent,
    smsConsentAt: aggregate.smsConsentAt,
  })

  return customerId
}

// ============================================================================
// Supabase-backed store (service role — bypasses RLS)
// ============================================================================

/** Postgres unique-violation code — a concurrent insert created the row first. */
const PG_UNIQUE_VIOLATION = '23505'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

interface OrderFactsRow {
  total: number | string | null
  created_at: string
  order_type: string | null
  customer_data: Record<string, unknown> | null
  order_items: Array<{ menu_item_name: string | null; quantity: number | null }> | null
}

/**
 * Map a raw `orders` row (with joined items) to the aggregate input shape.
 * Exported for testing the DB→domain coercion in isolation: dirty totals become
 * numbers, unnamed items are dropped, and consent is read out of customer_data.
 */
export function rowToFacts(row: OrderFactsRow): CustomerOrderFacts {
  const consent = row.customer_data?.sms_consent
  return {
    total: Number(row.total) || 0,
    createdAt: row.created_at,
    channel: row.order_type,
    items: (row.order_items ?? [])
      .filter((i): i is { menu_item_name: string; quantity: number } => Boolean(i?.menu_item_name))
      .map((i) => ({ name: i.menu_item_name, quantity: Number(i.quantity) || 0 })),
    smsConsent: consent === true,
  }
}

/**
 * Build the service-role backed CustomerStore. The caller owns the admin client
 * (created via `createAdminClient()`), keeping this module free of server-only
 * imports so the pure orchestration above stays unit-testable.
 */
export function createSupabaseCustomerStore(admin: AdminClient): CustomerStore {
  return {
    async findCustomerId(tenantId, phoneE164, email) {
      if (phoneE164) {
        const { data } = await admin
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('phone_e164', phoneE164)
          .maybeSingle()
        if (data?.id) return data.id as string
      }
      if (email) {
        // Match the partial unique index: email identity only when phone is null.
        const { data } = await admin
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .is('phone_e164', null)
          .eq('email', email)
          .maybeSingle()
        if (data?.id) return data.id as string
      }
      return null
    },

    async createCustomer(input) {
      const { data, error } = await admin
        .from('customers')
        .insert({
          tenant_id: input.tenantId,
          phone_e164: input.phoneE164,
          email: input.email,
          name: input.name,
        })
        .select('id')
        .single()

      if (error) {
        // Lost an insert race — the row now exists, so re-resolve its id.
        if (error.code === PG_UNIQUE_VIOLATION) {
          const existing = await this.findCustomerId(input.tenantId, input.phoneE164, input.email)
          if (existing) return existing
        }
        throw error
      }
      return data.id as string
    },

    async saveCustomerProfile(customerId, patch) {
      // `average_order_value` is a generated column — never write it.
      // `updated_at` is maintained by the customers_set_updated_at trigger.
      const update: Record<string, unknown> = {
        order_count: patch.orderCount,
        total_spent: patch.totalSpent,
        first_order_at: patch.firstOrderAt,
        last_order_at: patch.lastOrderAt,
        channels_used: patch.channelsUsed,
        top_items: patch.topItems,
        sms_consent: patch.smsConsent,
        sms_consent_at: patch.smsConsentAt,
        phone_e164: patch.phoneE164,
        email: patch.email,
      }
      // Only overwrite the name when this order actually carried one.
      if (patch.name) update.name = patch.name

      const { error } = await admin.from('customers').update(update).eq('id', customerId)
      if (error) throw error
    },

    async linkOrderToCustomer(orderId, customerId) {
      // `.is('customer_id', null)` keeps this a no-op once linked (idempotent).
      const { error } = await admin
        .from('orders')
        .update({ customer_id: customerId })
        .eq('id', orderId)
        .is('customer_id', null)
      if (error) throw error
    },

    async listCustomerOrders(customerId) {
      const { data, error } = await admin
        .from('orders')
        .select('total, created_at, order_type, customer_data, order_items(menu_item_name, quantity)')
        .eq('customer_id', customerId)
      if (error) throw error
      return (data as OrderFactsRow[] | null ?? []).map(rowToFacts)
    },
  }
}

// ============================================================================
// Admin-scoped reads (owner "Regulars" list + detail)
// ============================================================================

export type CustomersSort = 'recent' | 'top_spend' | 'frequent'

export interface CustomersListParams {
  sort?: CustomersSort
  limit?: number
  offset?: number
  /** Free-text match against name; if it looks like a phone, matches phone too. */
  search?: string
}

const SORT_COLUMN: Record<CustomersSort, string> = {
  recent: 'last_order_at',
  top_spend: 'total_spent',
  frequent: 'order_count',
}

/**
 * Apply the shared name/phone search filter + sort to a customers query.
 * Extracted so the list and the paginated read build the query identically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyCustomerFilters(query: any, params?: CustomersListParams) {
  const search = params?.search?.trim()
  if (search) {
    const { normalizePhoneE164 } = await import('@/lib/phone')
    const phone = normalizePhoneE164(search)
    query = phone
      ? query.or(`name.ilike.%${search}%,phone_e164.eq.${phone}`)
      : query.ilike('name', `%${search}%`)
  }

  const sortColumn = SORT_COLUMN[params?.sort ?? 'recent']
  return query.order(sortColumn, { ascending: false, nullsFirst: false })
}

/**
 * Fetch a tenant's customers for the owner list. Admin-gated + RLS-scoped: the
 * caller must be an admin of `tenantId` (or superadmin).
 */
export async function getCustomersByTenant(
  tenantId: string,
  params?: CustomersListParams
): Promise<Customer[]> {
  const { verifyTenantAdmin } = await import('@/lib/admin-service')
  await verifyTenantAdmin(tenantId)

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  let query = supabase.from('customers').select('*').eq('tenant_id', tenantId)
  query = await applyCustomerFilters(query, params)

  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Customer[]
}

export interface PaginatedCustomersResult {
  customers: Customer[]
  pagination: CustomersPagination
}

/** Page size for the owner Customers list. */
const CUSTOMERS_PAGE_SIZE = 50

/**
 * Fetch one page of a tenant's customers plus a total count, so the owner list
 * can page through more than the first window. Admin-gated + RLS-scoped. The
 * requested page (from the URL) is normalized by `computeCustomersPagination`,
 * which owns the offset/range/clamp math and is unit-tested in isolation.
 */
export async function getCustomersPage(
  tenantId: string,
  params?: CustomersListParams & { page?: number; pageSize?: number }
): Promise<PaginatedCustomersResult> {
  const { verifyTenantAdmin } = await import('@/lib/admin-service')
  await verifyTenantAdmin(tenantId)

  const { createClient } = await import('@/lib/supabase/server')
  const { computeCustomersPagination } = await import('@/lib/customers-pagination')
  const supabase = await createClient()

  const pageSize = params?.pageSize ?? CUSTOMERS_PAGE_SIZE

  // First count the matching rows so we know how many pages exist and can clamp
  // an out-of-range requested page before fetching the actual window.
  let countQuery = supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
  countQuery = await applyCustomerFilters(countQuery, params)
  const { count, error: countError } = await countQuery
  if (countError) throw countError

  const pagination = computeCustomersPagination(count ?? 0, params?.page ?? 1, pageSize)

  if (pagination.totalCount === 0) {
    return { customers: [], pagination }
  }

  let query = supabase.from('customers').select('*').eq('tenant_id', tenantId)
  query = await applyCustomerFilters(query, params)
  query = query.range(pagination.offset, pagination.offset + pagination.limit - 1)

  const { data, error } = await query
  if (error) throw error

  return { customers: (data ?? []) as unknown as Customer[], pagination }
}

export interface CustomerOrderSummary {
  id: string
  total: number
  created_at: string
  order_type: string | null
  status: string | null
}

export interface CustomerDetail {
  customer: Customer
  orders: CustomerOrderSummary[]
}

/**
 * Fetch one customer and their order history. Admin-gated + RLS-scoped. Returns
 * `null` when no such customer exists for this tenant.
 */
export async function getCustomerDetail(
  tenantId: string,
  customerId: string
): Promise<CustomerDetail | null> {
  const { verifyTenantAdmin } = await import('@/lib/admin-service')
  await verifyTenantAdmin(tenantId)

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw error
  if (!customer) return null

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, total, created_at, order_type, status')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (ordersError) throw ordersError

  return {
    customer: customer as unknown as Customer,
    orders: (orders ?? []) as unknown as CustomerOrderSummary[],
  }
}
