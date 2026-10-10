/**
 * The I/O shell behind /superadmin/pipeline. Service role: checkout_leads and
 * store_onboardings are not readable by any session role.
 *
 * Reads the leads in the page's window (paged past the 1000-row API cap) and
 * only the stores those leads became, so the cost tracks sign-ups in view,
 * not the platform.
 * First orders are read for platform-backend stores only (every store the
 * set-up link builds is one) — a lead's store on another backend is counted in
 * `storesWithUnreadOrders` rather than shown as "no orders".
 */

import 'server-only'

import { resolveOrderBackend, type OrderBackendPreference } from '@/lib/order-backend'
import { createAdminClient } from '@/lib/supabase/admin'
import { matchesOffer, windowStartMs, type PipelineFilters } from './filters'
import { leadTenantId, toPipelineLeads, type LeadRow, type OnboardingRow, type PaymentRow } from './rows'
import type { PipelineLead } from './types'

const PAGE = 1000
const MAX_LEAD_ROWS = 20000
/** Keeps each `.in(...)` filter well inside the URL length limit. */
const ID_CHUNK = 200
/** Payments are many per store: smaller chunks, each paged past the row cap. */
const PAYMENT_TENANT_CHUNK = 25
/** Parallel first-order reads; each is one indexed row from orders_tenant_created_idx. */
const FIRST_ORDER_CONCURRENCY = 8

const LEAD_COLUMNS =
  'id, reference_number, business_name, name, status, payment_term, created_at, payment_proof_uploaded_at, paid_at, live_at, tenant_id'
const ONBOARDING_COLUMNS = 'checkout_lead_id, tenant_id, status, created_at, started_at, finished_at, updated_at, error'

type AdminClient = ReturnType<typeof createAdminClient>

export interface PipelineData {
  leads: PipelineLead[]
  /** Lead stores on Convex / their own Supabase, whose orders were not read. */
  storesWithUnreadOrders: number
  generatedAt: string
}

interface TenantBackendRow {
  id: string
  order_backend: OrderBackendPreference | null
  convex_deployment_url: string | null
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size))
  return chunks
}

/** Leads created at or after `createdFromMs` (all when null), newest first. */
async function loadLeadRows(admin: AdminClient, createdFromMs: number | null): Promise<LeadRow[]> {
  const rows: LeadRow[] = []
  for (let from = 0; from < MAX_LEAD_ROWS; from += PAGE) {
    let query = admin.from('checkout_leads').select(LEAD_COLUMNS)
    if (createdFromMs !== null) query = query.gte('created_at', new Date(createdFromMs).toISOString())
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Could not read checkout leads: ${error.message}`)
    const batch = (data ?? []) as unknown as LeadRow[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

async function loadInChunks<T>(
  ids: readonly string[],
  read: (ids: string[]) => Promise<T[]>,
  size: number = ID_CHUNK,
): Promise<T[]> {
  const batches = await Promise.all(chunk(ids, size).map(read))
  return batches.flat()
}

async function loadOnboardings(admin: AdminClient, leadIds: readonly string[]): Promise<OnboardingRow[]> {
  return loadInChunks(leadIds, async (ids) => {
    const { data, error } = await admin.from('store_onboardings').select(ONBOARDING_COLUMNS).in('checkout_lead_id', ids)
    if (error) throw new Error(`Could not read set-up links: ${error.message}`)
    return (data ?? []) as unknown as OnboardingRow[]
  })
}

async function loadTenantBackends(admin: AdminClient, tenantIds: readonly string[]): Promise<TenantBackendRow[]> {
  return loadInChunks(tenantIds, async (ids) => {
    const { data, error } = await admin.from('tenants').select('id, order_backend, convex_deployment_url').in('id', ids)
    if (error) throw new Error(`Could not read stores: ${error.message}`)
    return (data ?? []) as unknown as TenantBackendRow[]
  })
}

async function loadPaymentsFor(admin: AdminClient, tenantIds: string[]): Promise<PaymentRow[]> {
  const rows: PaymentRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('subscription_payments')
      .select('tenant_id, paid_at')
      .in('tenant_id', tenantIds)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Could not read subscription payments: ${error.message}`)
    const batch = (data ?? []) as unknown as PaymentRow[]
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

async function loadPayments(admin: AdminClient, tenantIds: readonly string[]): Promise<PaymentRow[]> {
  return loadInChunks(tenantIds, (ids) => loadPaymentsFor(admin, ids), PAYMENT_TENANT_CHUNK)
}

async function loadFirstOrderAt(admin: AdminClient, tenantId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('orders')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(`Could not read orders: ${error.message}`)
  return (data?.[0] as { created_at: string } | undefined)?.created_at ?? null
}

async function loadFirstOrders(admin: AdminClient, tenantIds: readonly string[]): Promise<Map<string, string>> {
  const firstOrderAt = new Map<string, string>()
  for (const batch of chunk(tenantIds, FIRST_ORDER_CONCURRENCY)) {
    const results = await Promise.all(batch.map(async (id) => [id, await loadFirstOrderAt(admin, id)] as const))
    for (const [id, at] of results) if (at) firstOrderAt.set(id, at)
  }
  return firstOrderAt
}

/**
 * Every lead in the filters' window (the window is applied in SQL; the offer
 * is applied after, as `payment_term` may be null), with its store's facts.
 */
export async function loadPipelineData(filters: PipelineFilters, nowMs: number = Date.now()): Promise<PipelineData> {
  const admin = createAdminClient()
  const windowRows = await loadLeadRows(admin, windowStartMs(filters.range, nowMs))
  const leadRows = windowRows.filter((lead) => matchesOffer(lead.payment_term, filters.offer))
  const onboardings = await loadOnboardings(admin, leadRows.map((lead) => lead.id))

  const onboardingByLead = new Map(onboardings.map((row) => [row.checkout_lead_id, row]))
  const tenantIds = [
    ...new Set(
      leadRows
        .map((lead) => leadTenantId(lead, onboardingByLead.get(lead.id)))
        .filter((id): id is string => id !== null),
    ),
  ]

  const [backends, payments] = await Promise.all([
    loadTenantBackends(admin, tenantIds),
    loadPayments(admin, tenantIds),
  ])
  const platformIds = backends.filter((row) => resolveOrderBackend(row) === 'platform').map((row) => row.id)
  const firstOrderAt = await loadFirstOrders(admin, platformIds)

  return {
    leads: toPipelineLeads(leadRows, onboardings, { firstOrderAt, payments }),
    storesWithUnreadOrders: backends.length - platformIds.length,
    generatedAt: new Date(nowMs).toISOString(),
  }
}
