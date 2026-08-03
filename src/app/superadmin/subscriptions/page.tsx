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
  buildAllowanceRows,
  type AllowanceStaffMember,
} from '@/lib/billing/tenant-allowances'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader } from '@/components/superadmin/ui/primitives'

export const dynamic = 'force-dynamic'

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

  const [{ data: tenants }, { data: subscriptions }, { data: outlets }, { data: staff }] =
    await Promise.all([
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

  const rows = buildSubscriptionRoster(inputs, new Date().toISOString())

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
        subtitle="Overdue tenants first. Marking a client paid extends their access immediately."
      />

      <SubscriptionManager
        rows={rows}
        summary={summarizeRoster(rows)}
        allowances={allowances}
      />
    </div>
  )
}
