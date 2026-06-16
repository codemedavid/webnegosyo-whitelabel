import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/superadmin/ui/primitives'
import { getAllPlatformPaymentMethods } from '@/lib/checkout-leads/platform-payment-methods-service'
import { PaymentMethodsSettings } from './payment-methods-settings'

export default async function PaymentMethodsPage() {
  const methods = await getAllPlatformPaymentMethods()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Checkout"
        title="Payment Methods"
        subtitle="Manage the payment methods customers see on the checkout page"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/superadmin/checkout-leads">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to Leads
            </Link>
          </Button>
        }
      />

      <PaymentMethodsSettings initialMethods={methods} />
    </div>
  )
}
