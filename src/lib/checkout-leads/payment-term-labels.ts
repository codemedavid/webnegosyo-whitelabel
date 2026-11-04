import { SIX_MONTH_DOWNPAYMENT, getCheckoutBalanceDue } from './payment-terms'

function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH')}`
}

/**
 * Human-readable label for a checkout payment term, shared by the buyer's
 * confirmation page and the superadmin leads panel. Plan labels never quote a
 * plan price: leads filed before a price change keep their term, and the
 * amount they actually paid is shown beside the label from the row itself.
 *
 * The column is nullable. An unknown term is still worth showing raw (a term
 * added by a later migration should not go invisible), but a missing one
 * renders as nothing, not as "null".
 */
export function getPaymentTermLabel(paymentTerm: string | null | undefined): string {
  switch (paymentTerm) {
    case 'downpayment_50':
      return '50% Downpayment'
    case 'full_payment':
      return 'Full Payment'
    case 'monthly_subscription':
      return 'Monthly plan'
    case 'six_month_full':
      return '6-month plan (paid in full)'
    case 'six_month_downpayment':
      // Staff read this in the leads panel: the balance is the reminder that money is still owed.
      return `6-month plan (${peso(SIX_MONTH_DOWNPAYMENT)} down, ${peso(getCheckoutBalanceDue('six_month_downpayment'))} balance)`
    default:
      return paymentTerm ?? ''
  }
}
