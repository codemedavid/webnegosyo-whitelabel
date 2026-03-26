'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LeadStats } from '@/lib/leads/types'

export function LeadAnalytics({ stats }: { stats: LeadStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalLeads}</div>
          <p className="mt-1 text-xs text-green-500">
            ↑ {stats.newThisWeek} this week
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Conversion Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.conversionRate}%</div>
          <p className={`mt-1 text-xs ${stats.conversionDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {stats.conversionDelta >= 0 ? '↑' : '↓'} {Math.abs(stats.conversionDelta)}% vs last month
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-500">{stats.pendingCalls}</div>
          <p className="mt-1 text-xs text-amber-500">
            {stats.pendingToday} today
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Avg Response Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgResponseTimeHours}h</div>
          <p className={`mt-1 text-xs ${stats.avgResponseTimeHours <= 2 ? 'text-green-500' : 'text-red-500'}`}>
            {stats.avgResponseTimeHours <= 2 ? 'On target' : '↑ slower than target'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
