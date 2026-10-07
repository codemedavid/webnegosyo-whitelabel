/**
 * The platform owner's collections screen. The reads live in
 * `collections-data.ts`, shared with the Collections calendar.
 */

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSubscriptionRoster, summarizeRoster } from '@/lib/billing/subscription-roster'
import {
  collectedInMonth,
  recentPayments,
  summarizePaymentsByTenant,
} from '@/lib/billing/payment-history'
import { buildCollectionsInsights, summarizeCollections } from '@/lib/billing/collections-insight'
import {
  ROSTER_SUBSCRIPTION_COLUMNS,
  loadActivitySnapshots,
  loadPaymentLedger,
  toRosterInputs,
  type RosterSubscriptionShape,
} from '@/lib/billing/collections-data'
import { RecentPaymentsPanel } from '@/components/superadmin/subscriptions/recent-payments-panel'
import {
  buildAllowanceRows,
  type AllowanceStaffMember,
} from '@/lib/billing/tenant-allowances'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader } from '@/components/superadmin/ui/primitives'

export const dynamic = 'force-dynamic'

const RECENT_PAYMENTS_SHOWN = 10

interface TenantRowShape {
  id: string
  name: string
  slug: string
  max_outlets: number | null
  max_staff_per_branch: number | null
  created_at: string | null
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
      supabase.from('tenant_subscriptions').select(ROSTER_SUBSCRIPTION_COLUMNS),
      // Whole-table reads, counted in JS: PostgREST has no GROUP BY, and both
      // tables are small (single-digit rows per tenant across the platform).
      // Revisit if either grows a zero.
      supabase.from('outlets').select('id, tenant_id'),
      supabase.from('app_users').select('tenant_id, outlet_id, is_owner'),
      loadPaymentLedger(supabase),
      loadActivitySnapshots(nowIso),
    ])

  const inputs = toRosterInputs(
    (tenants ?? []) as TenantRowShape[],
    (subscriptions ?? []) as RosterSubscriptionShape[]
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
        actions={
          <Link
            href="/superadmin/subscriptions/calendar"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            <CalendarDays className="h-4 w-4" />
            Collections calendar
          </Link>
        }
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
