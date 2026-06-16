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
      return paymentTerm
  }
}
