import { FunnelPayment } from '@/components/funnel/funnel-payment'
import { FunnelWorld } from '@/components/funnel/funnel-world'
import type { CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'

/**
 * The payment page for a lead: the same payment step the funnel opens in
 * place after its order form, for a reload, a shared link or the older
 * /checkout form. Once the payment is confirmed the buyer gets a private
 * set-up link; an unpaid order never gets a store.
 */
export function ConfirmationContent({ lead }: { lead: CheckoutLeadConfirmation }) {
  return (
    <FunnelWorld>
      <FunnelPayment lead={lead} />
    </FunnelWorld>
  )
}
