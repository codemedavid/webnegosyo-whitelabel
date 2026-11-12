import type { CartLine } from '@/lib/cart/cart'
import type { AppVoucherPreview, AppVoucherPreviewRequest } from '@/lib/contract'
import { toCentavos } from '@/lib/money'
import { draftLines, stableStringify } from './draft'

/**
 * The voucher's discount is the store's answer, never an estimate: the code is
 * previewed against THIS bag, order type and branch, and previewed again
 * (debounced) whenever any of them changes.
 */
export const VOUCHER_REPREVIEW_DEBOUNCE_MS = 400

export interface VoucherPreviewInputs {
  code: string | null
  orderTypeId: string | undefined
  outletId: string | null
  lines: readonly CartLine[]
}

/** The preview to ask for; null while there is no code, no order type or nothing in the bag. */
export function voucherPreviewRequest({ code, orderTypeId, outletId, lines }: VoucherPreviewInputs): AppVoucherPreviewRequest | null {
  const trimmed = code?.trim() ?? ''
  if (trimmed === '' || !orderTypeId || lines.length === 0) return null
  return { code: trimmed, orderTypeId, outletId, lines: draftLines(lines) }
}

/** Same inputs → same key; a changed quantity, pick, order type or branch → a new preview. */
export function voucherPreviewKey(request: AppVoucherPreviewRequest): string {
  return stableStringify(request)
}

export type VoucherStatus = 'none' | 'checking' | 'applied' | 'notApplied' | 'invalid' | 'failed'

interface VoucherStatusInput {
  hasCode: boolean
  /** The bag has been still for the debounce: the preview on screen is for what is in the bag. */
  isSettled: boolean
  /** The preview shown is the previous bag's, kept while the new one loads. */
  isPlaceholder: boolean
  /** null = the store has no such code (any more). */
  preview: AppVoucherPreview | null | undefined
  /** The preview for the current bag failed and is not being asked again right now. */
  isError: boolean
}

export function voucherStatus(input: VoucherStatusInput): VoucherStatus {
  if (!input.hasCode) return 'none'
  if (!input.isSettled) return 'checking'
  // A failure for THIS bag wins over the previous bag's answer still on screen.
  if (input.isError && (input.isPlaceholder || input.preview === undefined)) return 'failed'
  if (input.isPlaceholder || input.preview === undefined) return 'checking'
  if (input.preview === null) return 'invalid'
  return input.preview.isApplied ? 'applied' : 'notApplied'
}

/** What the totals take off: only a settled, applied answer. */
export function voucherDiscountCentavos(status: VoucherStatus, preview: AppVoucherPreview | null | undefined): number {
  return status === 'applied' && preview ? toCentavos(preview.discount) : 0
}

/** The code the order carries: only one the store says applies to this bag. */
export function voucherCodeToSend(status: VoucherStatus, preview: AppVoucherPreview | null | undefined): string | null {
  return status === 'applied' && preview ? preview.code : null
}
