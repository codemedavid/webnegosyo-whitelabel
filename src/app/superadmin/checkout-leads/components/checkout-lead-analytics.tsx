import { Users, TrendingUp, CreditCard, Rocket } from 'lucide-react'
import type { CheckoutLeadStats } from '@/lib/checkout-leads/checkout-leads-analytics'

interface CheckoutLeadAnalyticsProps {
  stats: CheckoutLeadStats
}

export function CheckoutLeadAnalytics({ stats }: CheckoutLeadAnalyticsProps) {
  const cards = [
    {
      title: 'Total Leads',
      value: stats.totalLeads,
      icon: Users,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      subtitle: `${stats.newThisWeek} this week`,
      subtitleColor: 'text-green-600',
      prefix: stats.newThisWeek > 0 ? '+ ' : '',
    },
    {
      title: 'Paid',
      value: stats.paidCount,
      icon: CreditCard,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      subtitle: 'Awaiting setup',
      subtitleColor: 'text-amber-600',
    },
    {
      title: 'Live',
      value: stats.liveCount,
      icon: Rocket,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      subtitle: 'Setup complete',
      subtitleColor: 'text-green-600',
    },
    {
      title: 'Conversion Rate',
      value: `${stats.conversionRate}%`,
      icon: TrendingUp,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      subtitle: 'Initiated to live',
      subtitleColor: 'text-purple-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.title} className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.iconBg}`}>
              <card.icon className={`h-4.5 w-4.5 ${card.iconColor}`} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold">{card.prefix ?? ''}{card.value}</p>
          <p className={`mt-1 text-xs ${card.subtitleColor}`}>{card.subtitle}</p>
        </div>
      ))}
    </div>
  )
}
