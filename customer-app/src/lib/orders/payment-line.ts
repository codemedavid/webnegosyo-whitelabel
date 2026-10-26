import type { AppOrderDetail } from '@/lib/contract'
import { formatPeso, toCentavos } from '@/lib/money'

export interface PaymentLine {
  text: string
  tone: 'success' | 'muted' | 'danger'
}

/** One sentence about the money on the tracker. */
export function paymentLine(order: AppOrderDetail): PaymentLine {
  const total = formatPeso(toCentavos(order.totals.total))
  const method = order.paymentMethodName
  switch (order.paymentStatus) {
    case 'paid':
      return { text: method ? `Paid ${total} with ${method}` : `Paid ${total}`, tone: 'success' }
    case 'pending':
      return { text: method ? `${total} to pay with ${method}` : `${total} to pay`, tone: 'muted' }
    case 'failed':
      return { text: `Payment didn’t go through · ${total}`, tone: 'danger' }
    case 'refunded':
      return { text: method ? `${total} refunded to ${method}` : `${total} refunded`, tone: 'muted' }
    case 'unknown':
      return { text: `Total ${total}`, tone: 'muted' }
  }
}
