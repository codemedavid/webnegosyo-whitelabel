import { useState } from 'react'
import type { CartLine } from '@/lib/cart/cart'
import {
  VOUCHER_REPREVIEW_DEBOUNCE_MS,
  voucherCodeToSend,
  voucherDiscountCentavos,
  voucherPreviewKey,
  voucherPreviewRequest,
  voucherStatus,
} from '@/lib/checkout/voucher'
import { hasVoucherPreview, rememberVoucherPreview, useVoucherCheck, useVoucherPreview } from '@/lib/data/hooks'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'

interface VoucherInputs {
  orderTypeId: string | undefined
  outletId: string | null
  lines: readonly CartLine[]
  isEnabled: boolean
}

export type ApplyOutcome = 'applied' | 'notFound' | 'nothingToPreview'

/**
 * The bag's voucher, as the store prices it. Applying asks the store; after
 * that the code is previewed again (debounced) whenever the bag, order type
 * or branch changes, and the order only carries it while the answer is "applied".
 */
export function useVoucher({ orderTypeId, outletId, lines, isEnabled }: VoucherInputs) {
  const [code, setCode] = useState<string | null>(null)
  const check = useVoucherCheck()

  const request = isEnabled ? voucherPreviewRequest({ code, orderTypeId, outletId, lines }) : null
  const key = request ? voucherPreviewKey(request) : null
  const debounced = useDebouncedValue(request, key, VOUCHER_REPREVIEW_DEBOUNCE_MS)
  // An answer already in hand for exactly this bag (the Apply tap) needs no wait.
  const isSettled = debounced.isSettled || hasVoucherPreview(key)
  const preview = useVoucherPreview(request, key, isSettled)
  const status = voucherStatus({
    hasCode: request !== null,
    isSettled,
    isPlaceholder: preview.isPlaceholderData,
    preview: preview.data,
    isError: preview.isError && !preview.isFetching,
  })

  const apply = async (typed: string): Promise<ApplyOutcome> => {
    const typedRequest = voucherPreviewRequest({ code: typed, orderTypeId, outletId, lines })
    if (!typedRequest) return 'nothingToPreview'
    const answer = await check.mutateAsync(typedRequest)
    if (!answer) return 'notFound'
    rememberVoucherPreview(voucherPreviewKey({ ...typedRequest, code: answer.code }), answer)
    setCode(answer.code)
    return 'applied'
  }

  return {
    code: request ? code : null,
    /** The store's answer; while `checking` it may still be the previous bag's. */
    preview: preview.data ?? null,
    status,
    discountCentavos: voucherDiscountCentavos(status, preview.data),
    codeToSend: voucherCodeToSend(status, preview.data),
    apply,
    isApplying: check.isPending,
    remove: () => setCode(null),
    retry: () => void preview.refetch(),
  }
}

export type VoucherModel = ReturnType<typeof useVoucher>
