import type { CheckoutLeadWithPaymentMethod } from '@/types/database'

type PaymentTerm = CheckoutLeadWithPaymentMethod['payment_term']

/** Human-readable label for a checkout payment term. */
export function getPaymentTermLabel(paymentTerm: PaymentTerm): string {
  switch (paymentTerm) {
    case 'downpayment_50':
      return '50% Downpayment'
    case 'full_payment':
      return 'Full Payment'
    default:
      // The column is nullable. An unknown term is still worth showing raw —
      // a term added by a later migration should not go invisible — but a
      // missing one must render as nothing, not as "null".
      return paymentTerm ?? ''
  }
}
