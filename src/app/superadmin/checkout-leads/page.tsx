import { Suspense } from 'react'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Checkout Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track Smart Menu purchases and payment status
          </p>
        </div>
        <Link href="/superadmin/checkout-leads/payment-methods">
          <Button variant="outline" size="sm">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Payment Methods
          </Button>
        </Link>
      </div>

      <CheckoutLeadAnalytics stats={stats} />
      <CheckoutLeadPipeline statusBreakdown={stats.statusBreakdown} />

      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
        <CheckoutLeadsTable
          initialLeads={leadsResult.data}
          initialCount={leadsResult.count}
        />
      </Suspense>
    </div>
  )
}
