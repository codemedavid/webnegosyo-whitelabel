/**
 * What a placed order says about upsells, for the `upsell_converted` event.
 * Lifted out of the order-save success handler in `useCheckout`. Pure.
 */
import type { CartItem } from '@/types/database'

export interface UpsellConversionSummary {
  upsellItemCount: number
  upsellRevenue: number
  /** Upsold lines per offer source (`post_add`, `checkout_modal`, …). */
  sources: Record<string, number>
}

/** Null when nothing in the order was upsold, so no event is sent. */
export function summarizeUpsellConversions(items: readonly CartItem[]): UpsellConversionSummary | null {
  const upsold = items.filter((item): item is CartItem & { upsellSource: string } => Boolean(item.upsellSource))
  if (upsold.length === 0) return null

  return upsold.reduce<UpsellConversionSummary>(
    (summary, item) => ({
      upsellItemCount: summary.upsellItemCount + 1,
      upsellRevenue: summary.upsellRevenue + item.subtotal,
      sources: { ...summary.sources, [item.upsellSource]: (summary.sources[item.upsellSource] || 0) + 1 },
    }),
    { upsellItemCount: 0, upsellRevenue: 0, sources: {} }
  )
}
