import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getLeadStats } from '@/lib/leads/leads-analytics'
import { getLeads } from '@/lib/leads/leads-service'
import { PageHeader } from '@/components/superadmin/ui/primitives'
import { LeadAnalytics } from './components/lead-analytics'
import { LeadStatusPipeline } from './components/lead-status-pipeline'
import { LeadsTable } from './components/leads-table'

export default async function LeadsPage() {
  const [stats, leadsResult] = await Promise.all([
    getLeadStats(),
    getLeads({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Leads' },
        ]}
      />

      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        subtitle="Manage growth-call bookings and track conversions to tenants"
      />

      <LeadAnalytics stats={stats} />

      <LeadStatusPipeline statusBreakdown={stats.statusBreakdown} />

      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/[0.06]" />}>
        <LeadsTable
          initialLeads={leadsResult.data ?? []}
          initialCount={leadsResult.count ?? 0}
          statusBreakdown={stats.statusBreakdown}
        />
      </Suspense>
    </div>
  )
}
