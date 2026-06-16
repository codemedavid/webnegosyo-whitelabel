'use client'

import { Users, TrendingUp, Phone, Timer } from 'lucide-react'
import type { LeadStats } from '@/lib/leads/types'
import { KpiCard } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'

export function LeadAnalytics({ stats }: { stats: LeadStats }) {
  const responseOnTarget = stats.avgResponseTimeHours <= 2

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Total Leads"
        value={formatNumber(stats.totalLeads)}
        icon={Users}
        hint={
          stats.newThisWeek > 0 ? (
            <span className="text-emerald-400">+{stats.newThisWeek} new this week</span>
          ) : (
            'No new leads this week'
          )
        }
      />

      <KpiCard
        label="Conversion Rate"
        value={`${stats.conversionRate}%`}
        icon={TrendingUp}
        delta={stats.conversionDelta}
        hint="Converted this month vs last"
      />

      <KpiCard
        label="Pending Calls"
        value={formatNumber(stats.pendingCalls)}
        icon={Phone}
        hint={
          stats.pendingToday > 0 ? (
            <span className="text-amber-400">{stats.pendingToday} scheduled today</span>
          ) : (
            'None scheduled today'
          )
        }
      />

      <KpiCard
        label="Avg Response Time"
        value={`${stats.avgResponseTimeHours}h`}
        icon={Timer}
        hint={
          <span className={responseOnTarget ? 'text-emerald-400' : 'text-red-400'}>
            {responseOnTarget ? 'On target (under 2h)' : 'Slower than 2h target'}
          </span>
        }
      />
    </div>
  )
}
