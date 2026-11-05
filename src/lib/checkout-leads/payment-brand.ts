/**
 * How the funnel presents a platform payment method. The methods are free-text
 * rows staff edit in Superadmin → Payment methods (`name`, `details`), so the
 * logo is matched by name and the account number is read out of the details.
 */

export type PaymentBrandId = 'gcash' | 'bpi'

export interface PaymentBrand {
  id: PaymentBrandId
  /** The brand's own spelling, whatever the staff typed ("Gcash" → "GCash"). */
  displayName: string
  /** Official artwork in /public/payments (shown on a white plate). */
  logoSrc: string
  /** What the wallet calls its number, for the copy row. */
  numberLabel: string
}

const BRANDS: ReadonlyArray<{ brand: PaymentBrand; matches: (folded: string) => boolean }> = [
  {
    brand: { id: 'gcash', displayName: 'GCash', logoSrc: '/payments/gcash.svg', numberLabel: 'GCash number' },
    matches: (folded) => folded.includes('gcash'),
  },
  {
    brand: { id: 'bpi', displayName: 'BPI', logoSrc: '/payments/bpi.svg', numberLabel: 'Account number' },
    // Whole word only: "Subpixel" must not read as BPI.
    matches: (folded) => /\bbpi\b/.test(folded) || folded.includes('bank of the philippine islands'),
  },
]

/** Lower case, with "G-Cash" / "G Cash" folded to "gcash". */
function foldName(name: string): string {
  return name.trim().toLowerCase().replace(/\bg[\s-]+cash\b/g, 'gcash')
}

export function paymentBrandFor(name: string): PaymentBrand | null {
  const folded = foldName(name)
  if (!folded) return null
  return BRANDS.find((entry) => entry.matches(folded))?.brand ?? null
}

export interface PaymentDetails {
  accountName: string | null
  /** Digits only, ready for the clipboard. */
  accountNumber: string | null
  /** Every other line, shown as written. */
  extraLines: string[]
}

/** A mobile or bank account number: digits with optional spaces / dashes. */
const MIN_ACCOUNT_DIGITS = 7
const NUMBER_LINE = /^[\d\s-]+$/

function isAccountNumberLine(line: string): boolean {
  return NUMBER_LINE.test(line) && line.replace(/\D/g, '').length >= MIN_ACCOUNT_DIGITS
}

/**
 * Reads "John Angelo David\n09928214519" (either order) into a name and a
 * number. The first text line is the name; anything else is kept as is.
 */
export function parsePaymentDetails(details: string | null | undefined): PaymentDetails | null {
  const lines = (details ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const numberLine = lines.find(isAccountNumberLine) ?? null
  const textLines = lines.filter((line) => line !== numberLine)
  return {
    accountName: textLines[0] ?? null,
    accountNumber: numberLine ? numberLine.replace(/\D/g, '') : null,
    extraLines: textLines.slice(1),
  }
}
