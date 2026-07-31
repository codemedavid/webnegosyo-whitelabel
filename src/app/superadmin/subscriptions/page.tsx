/**
 * The platform owner's collections screen.
 *
 * Two queries rather than a join: `tenant_subscriptions` has one row per tenant
 * at most, and a tenant with no row yet must still appear in the list — a
 * client who has never been billed is exactly the one worth noticing.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { buildSubscriptionRoster, summarizeRoster, type RosterInput } from '@/lib/billing/subscription-roster'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'

export const dynamic = 'force-dynamic'

interface SubscriptionRowShape {
  tenant_id: string
  status: string | null
  paid_through: string | null
  grace_days: number | null
  monthly_price_php: number | null
}

export default async function SubscriptionsPage() {
  const supabase = createAdminClient()

  const [{ data: tenants }, { data: subscriptions }] = await Promise.all([
    supabase.from('tenants').select('id, name, slug').order('name'),
    supabase
      .from('tenant_subscriptions')
      .select('tenant_id, status, paid_through, grace_days, monthly_price_php'),
  ])

  const byTenant = new Map<string, SubscriptionRowShape>(
    ((subscriptions ?? []) as SubscriptionRowShape[]).map((row) => [row.tenant_id, row])
  )

  const inputs: RosterInput[] = ((tenants ?? []) as { id: string; name: string; slug: string }[]).map(
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
      }
    }
  )

  const rows = buildSubscriptionRoster(inputs, new Date().toISOString())

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-neutral-900">Subscriptions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Overdue tenants first. Marking a client paid extends their access immediately.
        </p>
      </header>

      <SubscriptionManager rows={rows} summary={summarizeRoster(rows)} />
    </div>
  )
}
