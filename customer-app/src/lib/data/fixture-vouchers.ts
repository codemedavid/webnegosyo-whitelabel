import { unitPriceCentavos } from '@/lib/cart/pricing'
import type { AppCatalog, AppVoucherPreview, AppVoucherPreviewRequest } from '@/lib/contract'
import { formatPeso, fromCentavos, toCentavos } from '@/lib/money'

/**
 * Prototype only — the demo's stand-in for the server's voucher preview. The
 * real app never estimates a discount; it shows what /vouchers/preview says.
 */
export interface PrototypeVoucher {
  code: string
  label: string
  kind: 'percent' | 'fixed'
  /** Percent (10 = 10%) or pesos off. */
  value: number
  maxDiscount: number | null
  minSpend: number | null
}

export const PROTOTYPE_VOUCHERS: readonly PrototypeVoucher[] = [
  { code: 'KAPE10', label: '10% off your order', kind: 'percent', value: 10, maxDiscount: 50, minSpend: 200 },
  { code: 'LESS50', label: '₱50 off', kind: 'fixed', value: 50, maxDiscount: null, minSpend: 300 },
]

export const findPrototypeVoucher = (code: string | null | undefined) =>
  PROTOTYPE_VOUCHERS.find((voucher) => voucher.code === code?.trim().toUpperCase())

export type PrototypeVoucherResult = { isApplied: true; discountCentavos: number } | { isApplied: false; discountCentavos: 0; reason: string }

/** The discount a voucher gives on this subtotal (centavos). */
export function prototypeVoucherDiscount(terms: PrototypeVoucher, subtotalCentavos: number): PrototypeVoucherResult {
  const minSpend = terms.minSpend ? toCentavos(terms.minSpend) : 0
  if (subtotalCentavos < minSpend)
    return { isApplied: false, discountCentavos: 0, reason: `Add ${formatPeso(minSpend - subtotalCentavos)} more to use ${terms.code}` }
  const raw = terms.kind === 'percent' ? Math.round((subtotalCentavos * terms.value) / 100) : toCentavos(terms.value)
  const capped = terms.maxDiscount === null ? raw : Math.min(raw, toCentavos(terms.maxDiscount))
  return { isApplied: true, discountCentavos: Math.min(capped, subtotalCentavos) }
}

/** What the prototype "server" previews for this bag, priced from the menu shown. */
export function prototypeVoucherPreview(request: AppVoucherPreviewRequest, catalog: AppCatalog): AppVoucherPreview | null {
  const terms = findPrototypeVoucher(request.code)
  if (!terms) return null
  const subtotalCentavos = request.lines.reduce((sum, line) => {
    const item = catalog.items.find((candidate) => candidate.id === line.itemId)
    return item ? sum + unitPriceCentavos(item, line.selections) * line.quantity : sum
  }, 0)
  const result = prototypeVoucherDiscount(terms, subtotalCentavos)
  return {
    code: terms.code,
    label: terms.label,
    isApplied: result.isApplied,
    discount: fromCentavos(result.discountCentavos),
    reason: result.isApplied ? null : result.reason,
  }
}
