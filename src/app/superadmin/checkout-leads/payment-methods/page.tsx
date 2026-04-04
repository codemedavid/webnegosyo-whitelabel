import { getAllPlatformPaymentMethods } from '@/lib/checkout-leads/platform-payment-methods-service'
import { PaymentMethodsSettings } from './payment-methods-settings'

export default async function PaymentMethodsPage() {
  const methods = await getAllPlatformPaymentMethods()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Methods</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage payment methods shown on the checkout page
        </p>
      </div>

      <PaymentMethodsSettings initialMethods={methods} />
    </div>
  )
}
