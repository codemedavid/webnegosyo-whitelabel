import { Users, TrendingUp, CreditCard, Rocket } from 'lucide-react'
import { KpiCard } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'
import type { CheckoutLeadStats } from '@/lib/checkout-leads/checkout-leads-analytics'

interface CheckoutLeadAnalyticsProps {
  stats: CheckoutLeadStats
}

export function CheckoutLeadAnalytics({ stats }: CheckoutLeadAnalyticsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        label="Total Leads"
        value={formatNumber(stats.totalLeads)}
        icon={Users}
        hint={
          stats.newThisWeek > 0
            ? `+${formatNumber(stats.newThisWeek)} this week`
            : 'No new leads this week'
        }
      />
      <KpiCard
        label="Paid"
        value={formatNumber(stats.paidCount)}
        icon={CreditCard}
        hint="Awaiting setup"
      />
      <KpiCard
        label="Live"
        value={formatNumber(stats.liveCount)}
        icon={Rocket}
        hint="Setup complete"
      />
      <KpiCard
        label="Conversion"
        value={`${stats.conversionRate}%`}
        icon={TrendingUp}
        hint="Initiated to live"
      />
    </div>
  )
}
