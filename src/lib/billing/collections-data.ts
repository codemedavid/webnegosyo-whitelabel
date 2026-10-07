/**
 * The reads behind the platform owner's collections screens (the Subscriptions
 * list and the Collections calendar), shared so the two cannot disagree about
 * who owes.
 *
 * Two queries rather than a join for the roster: `tenant_subscriptions` has one
 * row per tenant at most, and a tenant with no row yet must still appear — a
 * client who has never been billed is exactly the one worth noticing.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { RosterInput } from '@/lib/billing/subscription-roster'
import type { PaymentLedgerRow } from '@/lib/billing/payment-history'
import { DORMANT_AFTER_DAYS, type TenantActivitySnapshot } from '@/lib/billing/collections-insight'
import { resolveActivityWindow } from '@/lib/activity/activity-window'
import { getTenantActivity } from '@/lib/activity/tenant-activity-server'

const LEDGER_PAGE = 1000
const MAX_LEDGER_ROWS = 50000

type AdminClient = ReturnType<typeof createAdminClient>

export interface RosterTenantShape {
  id: string
  name: string
  slug: string
  created_at: string | null
}

export interface RosterSubscriptionShape {
  tenant_id: string
  status: string | null
  paid_through: string | null
  grace_days: number | null
  monthly_price_php: number | null
  billing_anchor_date: string | null
}

export const ROSTER_SUBSCRIPTION_COLUMNS =
  'tenant_id, status, paid_through, grace_days, monthly_price_php, billing_anchor_date'

/** One roster input per tenant, whether or not it has a subscription row yet. */
export function toRosterInputs(
  tenants: readonly RosterTenantShape[],
  subscriptions: readonly RosterSubscriptionShape[]
): RosterInput[] {
  const byTenant = new Map(subscriptions.map((row) => [row.tenant_id, row]))
  return tenants.map((tenant) => {
    const subscription = byTenant.get(tenant.id)
    return {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: subscription?.status ?? null,
      paidThrough: subscription?.paid_through ?? null,
      graceDays: subscription?.grace_days ?? null,
      monthlyPricePhp: subscription?.monthly_price_php ?? null,
      joinedAt: tenant.created_at,
      billingAnchorDate: subscription?.billing_anchor_date ?? null,
    }
  })
}

/**
 * Every payment ever recorded, paged past PostgREST's 1000-row cap — at one
 * row per client per month the ledger outgrows a single page within a year.
 *
 * Null on failure, not an empty list: an unreadable ledger must not render
 * every client as "Never paid".
 */
export async function loadPaymentLedger(admin: AdminClient): Promise<PaymentLedgerRow[] | null> {
  const rows: PaymentLedgerRow[] = []
  for (let from = 0; from < MAX_LEDGER_ROWS; from += LEDGER_PAGE) {
    const { data, error } = await admin
      .from('subscription_payments')
      .select('tenant_id, amount_php, period_start, period_end, paid_at, created_at, method, reference')
      .order('created_at', { ascending: false })
      .range(from, from + LEDGER_PAGE - 1)
    if (error) {
      console.error('[subscriptions] payment ledger read failed:', error.message)
      return null
    }
    const batch = (data ?? []) as unknown as PaymentLedgerRow[]
    rows.push(...batch)
    if (batch.length < LEDGER_PAGE) break
  }
  return rows
}

/**
 * Orders per store over the last 30 days. Null on failure: the collections
 * screens must still say who owes when the order backends cannot be read.
 */
export async function loadActivitySnapshots(
  nowIso: string
): Promise<Map<string, TenantActivitySnapshot> | null> {
  const window = resolveActivityWindow({ range: `${DORMANT_AFTER_DAYS}d` }, nowIso)
  try {
    const report = await getTenantActivity({ startMs: window.startMs, endMs: window.endMs })
    return new Map(
      report.rows.map((row) => [
        row.tenantId,
        { source: row.source, orders30d: row.orders, lastOrderAt: row.lastOrderAt },
      ])
    )
  } catch (error) {
    console.error(
      '[subscriptions] activity read failed:',
      error instanceof Error ? error.message : error
    )
    return null
  }
}
