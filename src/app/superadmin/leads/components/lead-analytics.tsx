'use client'

import { Users, TrendingUp, Phone, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { LeadStats } from '@/lib/leads/types'

export function LeadAnalytics({ stats }: { stats: LeadStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Leads */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Total Leads</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Users className="h-4.5 w-4.5 text-blue-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.totalLeads}</div>
          <p className="mt-1 text-xs text-green-600">
            ↑ {stats.newThisWeek} this week
          </p>
        </CardContent>
      </Card>

      {/* Conversion Rate */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
              <TrendingUp className="h-4.5 w-4.5 text-green-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.conversionRate}%</div>
          <p className={`mt-1 text-xs ${stats.conversionDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.conversionDelta >= 0 ? '↑' : '↓'} {Math.abs(stats.conversionDelta)}% vs last month
          </p>
        </CardContent>
      </Card>

      {/* Pending Calls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Pending Calls</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Phone className="h-4.5 w-4.5 text-amber-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.pendingCalls}</div>
          <p className="mt-1 text-xs text-amber-600">
            {stats.pendingToday} scheduled today
          </p>
        </CardContent>
      </Card>

      {/* Avg Response Time */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Avg Response Time</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <Clock className="h-4.5 w-4.5 text-purple-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.avgResponseTimeHours}h</div>
          <p className={`mt-1 text-xs ${stats.avgResponseTimeHours <= 2 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.avgResponseTimeHours <= 2 ? 'On target (<2h)' : 'Slower than target'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
