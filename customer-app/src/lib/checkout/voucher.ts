import { formatPeso, toCentavos } from '@/lib/money'

/** A voucher's terms as the store's preview returns them (amounts in pesos, like the wire). */
export interface VoucherTerms {
  code: string
  label: string
  kind: 'percent' | 'fixed'
  /** Percent (10 = 10%) or pesos off. */
  value: number
  maxDiscount: number | null
  minSpend: number | null
}

export type VoucherResult =
  | { isApplied: true; discountCentavos: number }
  | { isApplied: false; discountCentavos: 0; reason: string }

/** The discount a voucher gives on this subtotal. The server re-checks it when the order is placed. */
export function voucherDiscount(terms: VoucherTerms, subtotalCentavos: number): VoucherResult {
  const minSpend = terms.minSpend ? toCentavos(terms.minSpend) : 0
  if (subtotalCentavos < minSpend)
    return {
      isApplied: false,
      discountCentavos: 0,
      reason: `Add ${formatPeso(minSpend - subtotalCentavos)} more to use ${terms.code}`,
    }
  const raw = terms.kind === 'percent' ? Math.round((subtotalCentavos * terms.value) / 100) : toCentavos(terms.value)
  const capped = terms.maxDiscount === null ? raw : Math.min(raw, toCentavos(terms.maxDiscount))
  return { isApplied: true, discountCentavos: Math.min(capped, subtotalCentavos) }
}
