/**
 * The platform owner's collections screen.
 *
 * Two queries rather than a join: `tenant_subscriptions` has one row per tenant
 * at most, and a tenant with no row yet must still appear in the list — a
 * client who has never been billed is exactly the one worth noticing.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { buildSubscriptionRoster, summarizeRoster, type RosterInput } from '@/lib/billing/subscription-roster'
import {
  collectedInMonth,
  recentPayments,
  summarizePaymentsByTenant,
  type PaymentLedgerRow,
} from '@/lib/billing/payment-history'
import {
  DORMANT_AFTER_DAYS,
  buildCollectionsInsights,
  summarizeCollections,
  type TenantActivitySnapshot,
} from '@/lib/billing/collections-insight'
import { resolveActivityWindow } from '@/lib/activity/activity-window'
import { getTenantActivity } from '@/lib/activity/tenant-activity-server'
import { RecentPaymentsPanel } from '@/components/superadmin/subscriptions/recent-payments-panel'
import {
  buildAllowanceRows,
  type AllowanceStaffMember,
} from '@/lib/billing/tenant-allowances'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader } from '@/components/superadmin/ui/primitives'

export const dynamic = 'force-dynamic'

const LEDGER_PAGE = 1000
const MAX_LEDGER_ROWS = 50000
const RECENT_PAYMENTS_SHOWN = 10

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Every payment ever recorded, paged past PostgREST's 1000-row cap — at one
 * row per client per month the ledger outgrows a single page within a year.
 *
 * Null on failure, not an empty list: an unreadable ledger must not render
 * every client as "Never paid".
 */
async function loadPaymentLedger(admin: AdminClient): Promise<PaymentLedgerRow[] | null> {
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
 * table must still say who owes when the order backends cannot be read.
 */
async function loadActivitySnapshots(
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

interface TenantRowShape {
  id: string
  name: string
  slug: string
  max_outlets: number | null
  max_staff_per_branch: number | null
  created_at: string | null
}

interface SubscriptionRowShape {
  tenant_id: string
  status: string | null
  paid_through: string | null
  grace_days: number | null
  monthly_price_php: number | null
  billing_anchor_date: string | null
}

export default async function SubscriptionsPage() {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const [
    { data: tenants },
    { data: subscriptions },
    { data: outlets },
    { data: staff },
    ledger,
    activity,
  ] = await Promise.all([
      supabase.from('tenants').select('id, name, slug, max_outlets, max_staff_per_branch, created_at').order('name'),
      supabase
        .from('tenant_subscriptions')
        .select(
          'tenant_id, status, paid_through, grace_days, monthly_price_php, billing_anchor_date'
        ),
      // Whole-table reads, counted in JS: PostgREST has no GROUP BY, and both
      // tables are small (single-digit rows per tenant across the platform).
      // Revisit if either grows a zero.
      supabase.from('outlets').select('id, tenant_id'),
      supabase.from('app_users').select('tenant_id, outlet_id, is_owner'),
      loadPaymentLedger(supabase),
      loadActivitySnapshots(nowIso),
    ])

  const byTenant = new Map<string, SubscriptionRowShape>(
    ((subscriptions ?? []) as SubscriptionRowShape[]).map((row) => [row.tenant_id, row])
  )

  const inputs: RosterInput[] = ((tenants ?? []) as TenantRowShape[]).map(
    (tenant) => {
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
    }
  )

  const rows = buildSubscriptionRoster(inputs, nowIso)

  const insights = ledger
    ? buildCollectionsInsights(rows, summarizePaymentsByTenant(ledger), activity)
    : undefined
  const tenantNames = Object.fromEntries(rows.map((row) => [row.tenantId, row.name]))

  // Group once per table rather than filtering inside the tenant loop, so the
  // page stays linear in rows instead of quadratic as the platform grows.
  const outletsByTenant = new Map<string, string[]>()
  for (const outlet of (outlets ?? []) as { id: string; tenant_id: string }[]) {
    outletsByTenant.set(outlet.tenant_id, [...(outletsByTenant.get(outlet.tenant_id) ?? []), outlet.id])
  }

  const staffByTenant = new Map<string, AllowanceStaffMember[]>()
  for (const member of (staff ?? []) as {
    tenant_id: string
    outlet_id: string | null
    is_owner: boolean | null
  }[]) {
    staffByTenant.set(member.tenant_id, [
      ...(staffByTenant.get(member.tenant_id) ?? []),
      { outletId: member.outlet_id ?? null, isOwner: member.is_owner },
    ])
  }

  const allowances = buildAllowanceRows(
    ((tenants ?? []) as TenantRowShape[]).map((tenant) => ({
      tenantId: tenant.id,
      maxOutlets: tenant.max_outlets,
      maxStaffPerBranch: tenant.max_staff_per_branch,
      outletIds: outletsByTenant.get(tenant.id) ?? [],
      staff: staffByTenant.get(tenant.id) ?? [],
    }))
  )

  // No padding of its own: the superadmin layout already frames the page, and
  // the second p-6 pushed the table a full gutter off every sibling screen.
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: '/superadmin' }, { label: 'Subscriptions' }]}
      />
      <PageHeader
        eyebrow="Billing"
        title="Subscriptions"
        subtitle="Stores trading without paying first, then overdue. Marking a client paid extends their access immediately."
      />

      {!ledger && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          The payment ledger could not be read, so payment history is hidden. Who owes is still
          accurate.
        </p>
      )}

      <SubscriptionManager
        rows={rows}
        summary={summarizeRoster(rows)}
        allowances={allowances}
        insights={insights}
        collections={insights ? summarizeCollections(rows, insights) : undefined}
        collected={ledger ? collectedInMonth(ledger, nowIso) : undefined}
        nowIso={nowIso}
      />

      {ledger && (
        <RecentPaymentsPanel
          payments={recentPayments(ledger, RECENT_PAYMENTS_SHOWN)}
          tenantNames={tenantNames}
        />
      )}
    </div>
  )
}
