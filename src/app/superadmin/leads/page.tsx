import { Suspense } from 'react'
import { getLeadStats } from '@/lib/leads/leads-analytics'
import { getLeads } from '@/lib/leads/leads-service'
import { LeadAnalytics } from './components/lead-analytics'
import { LeadsTable } from './components/leads-table'

export default async function LeadsPage() {
  const [stats, leadsResult] = await Promise.all([
    getLeadStats(),
    getLeads({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage growth call bookings and track conversions
        </p>
      </div>

      <LeadAnalytics stats={stats} />

      <Suspense fallback={<div className="h-96 animate-pulse rounded bg-muted" />}>
        <LeadsTable
          initialLeads={leadsResult.data ?? []}
          initialCount={leadsResult.count ?? 0}
        />
      </Suspense>
    </div>
  )
}
