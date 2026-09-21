/**
 * Payment-detail line parsing — pure, framework-agnostic.
 *
 * Merchants describe a payment method as free text, one fact per line
 * ("GCash: 0917 123 4567"). The checkout renders each line as a label + value
 * row with a copy button that copies ONLY the value, so a customer pasting an
 * account number into their banking app does not carry the label along.
 */

import type { PaymentMethod } from '@/types/database'

export interface PaymentDetailRow {
  /** Left-hand label when the line reads "Label: value"; null for plain lines. */
  label: string | null
  /** What the copy button copies. */
  value: string
}

/** A label longer than this reads as a sentence, not a field name. */
const MAX_LABEL_LENGTH = 32

/** Hint shown under a method that pays by QR. */
const QR_HINT = 'Scan QR to pay'
/** Hint shown under a method that places the order without a payment step. */
const SKIP_HINT = 'No payment details needed'

function splitLabelledLine(line: string): PaymentDetailRow {
  const colonIndex = line.indexOf(':')
  if (colonIndex <= 0) return { label: null, value: line }

  const label = line.slice(0, colonIndex).trim()
  const value = line.slice(colonIndex + 1).trim()
  const isUrlScheme = value.startsWith('/')
  const isLabelShaped = label.length > 0 && label.length <= MAX_LABEL_LENGTH
  if (!value || isUrlScheme || !isLabelShaped) return { label: null, value: line }

  return { label, value }
}

/** Parse merchant-entered payment details into label/value rows. */
export function parsePaymentDetailLines(details: string | null | undefined): PaymentDetailRow[] {
  if (!details) return []
  return details
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(splitLabelledLine)
}

type PaymentMethodHintSource = Pick<PaymentMethod, 'qr_code_url' | 'details' | 'skip_payment_details'>

/** One-line hint under a payment option so the customer knows what to expect. */
export function getPaymentMethodHint(method: Partial<PaymentMethodHintSource>): string | null {
  if (method.qr_code_url) return QR_HINT
  const firstLine = parsePaymentDetailLines(method.details)[0]
  if (firstLine) return firstLine.label ? `${firstLine.label}: ${firstLine.value}` : firstLine.value
  if (method.skip_payment_details) return SKIP_HINT
  return null
}
