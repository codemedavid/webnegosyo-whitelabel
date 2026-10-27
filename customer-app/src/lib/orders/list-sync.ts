import type { AppOrderDetail, AppOrderSummary } from '@/lib/contract'

/** The history list after the tracker saw a newer status, so going back never shows an old one. */
export function withTrackedOrder(
  list: readonly AppOrderSummary[] | undefined,
  order: Pick<AppOrderDetail, 'id' | 'status'>,
): AppOrderSummary[] | undefined {
  if (!list) return undefined
  const current = list.find((summary) => summary.id === order.id)
  if (!current || current.status === order.status) return list as AppOrderSummary[]
  return list.map((summary) => (summary.id === order.id ? { ...summary, status: order.status } : summary))
}
