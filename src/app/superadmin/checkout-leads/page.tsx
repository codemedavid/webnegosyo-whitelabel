import { Suspense } from 'react'
import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/superadmin/ui/primitives'
import { getCheckoutLeadStats } from '@/lib/checkout-leads/checkout-leads-analytics'
import { getCheckoutLeads } from '@/lib/checkout-leads/checkout-leads-service'
import { CheckoutLeadAnalytics } from './components/checkout-lead-analytics'
import { CheckoutLeadPipeline } from './components/checkout-lead-pipeline'
import { CheckoutLeadsTable } from './components/checkout-leads-table'

export default async function CheckoutLeadsPage() {
  const [stats, leadsResult] = await Promise.all([
    getCheckoutLeadStats(),
    getCheckoutLeads({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Smart Menu"
        title="Checkout Leads"
        subtitle="Track Smart Menu purchases, payment status, and onboarding progress"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/superadmin/checkout-leads/payment-methods">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Payment Methods
            </Link>
          </Button>
        }
      />

      <CheckoutLeadAnalytics stats={stats} />

      <CheckoutLeadPipeline statusBreakdown={stats.statusBreakdown} />

      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />}
      >
        <CheckoutLeadsTable initialLeads={leadsResult.data} initialCount={leadsResult.count} />
      </Suspense>
    </div>
  )
}
