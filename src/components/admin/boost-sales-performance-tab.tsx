'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart3, AlertTriangle } from 'lucide-react'

interface BoostSalesPerformanceTabProps {
  tenantId: string
  convexDeploymentUrl: string | null
}

export function BoostSalesPerformanceTab({
  tenantId,
  convexDeploymentUrl,
}: BoostSalesPerformanceTabProps) {
  if (!convexDeploymentUrl) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Analytics Not Connected</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Connect your analytics backend to see upsell performance data.
              Track acceptance rates, revenue impact, and find what&apos;s working.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return <PerformanceDashboard tenantId={tenantId} />
}

function PerformanceDashboard({ tenantId: _tenantId }: { tenantId: string }) {
  const channels = [
    { name: 'Upgrade to Meal', shown: 0, accepted: 0, rate: '—', revenue: '—' },
    { name: 'Pair Suggestions', shown: 0, accepted: 0, rate: '—', revenue: '—' },
    { name: 'Checkout Picks', shown: 0, accepted: 0, rate: '—', revenue: '—' },
    { name: 'Bundle Upsell', shown: 0, accepted: 0, rate: '—', revenue: '—' },
  ]

  return (
    <div className="space-y-6">
      {/* Top-level metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Acceptance Rate', value: '—', detail: 'Across all channels' },
          { label: 'Revenue from Upsells', value: '—', detail: 'Last 30 days' },
          { label: 'Extra per Order', value: '—', detail: 'Avg from upsold items' },
          { label: 'Best Channel', value: '—', detail: 'Highest acceptance rate' },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold mt-1">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-channel breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Performance by Channel</CardTitle>
          <CardDescription>How each upsell type is performing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium text-right">Shown</th>
                  <th className="pb-2 font-medium text-right">Accepted</th>
                  <th className="pb-2 font-medium text-right">Rate</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.name} className="border-b last:border-0">
                    <td className="py-3">{ch.name}</td>
                    <td className="py-3 text-right text-muted-foreground">{ch.shown}</td>
                    <td className="py-3 text-right text-muted-foreground">{ch.accepted}</td>
                    <td className="py-3 text-right">{ch.rate}</td>
                    <td className="py-3 text-right">{ch.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Data updates as customers interact with your upsell suggestions.
          </p>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Tips to Improve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Performance tips will appear here once you have enough data from customer interactions.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
