import {
  SIX_MONTH_BONUS_MONTHS,
  SIX_MONTH_DOWNPAYMENT,
  SIX_MONTH_INSTALLMENT_PRICE,
  SIX_MONTH_PLAN_MONTHS,
  getCheckoutBalanceDue,
} from './payment-terms'

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
      // No paid-in-full lead predates the free month (checked 2026-11-09), so every one is owed 6 + 1.
      return `6-month plan + ${SIX_MONTH_BONUS_MONTHS} free month (paid in full)`
    case 'six_month_downpayment':
      // Staff read this in the leads panel: the balance is the reminder that money is still owed.
      return `6-month plan (${peso(SIX_MONTH_DOWNPAYMENT)} down, ${peso(getCheckoutBalanceDue('six_month_downpayment'))} balance)`
    case 'six_month_installment':
      // Staff collect the next five months by hand: the label says it is a monthly bill.
      return `6-month plan (${peso(SIX_MONTH_INSTALLMENT_PRICE)}/month × ${SIX_MONTH_PLAN_MONTHS})`
    default:
      return paymentTerm ?? ''
  }
}
