import type { AppOrderDetail, AppOrderPage, AppOrderSummary } from '@/lib/contract'

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

/** The history as react-query's infinite cache holds it. */
export interface OrderPages {
  pages: AppOrderPage[]
  pageParams: unknown[]
}

/** Every loaded page as one newest-first list; an order seen on two pages (it moved while paging) shows once. */
export function flattenOrderPages(data: Pick<OrderPages, 'pages'> | undefined): AppOrderSummary[] {
  if (!data) return []
  const seen = new Set<string>()
  return data.pages.flatMap((page) => page.orders).filter((order) => (seen.has(order.id) ? false : (seen.add(order.id), true)))
}

/** `withTrackedOrder` across every loaded page; untouched pages keep their identity. */
export function withTrackedOrderInPages(data: OrderPages | undefined, order: Pick<AppOrderDetail, 'id' | 'status'>): OrderPages | undefined {
  if (!data) return undefined
  let isChanged = false
  const pages = data.pages.map((page) => {
    const orders = withTrackedOrder(page.orders, order) ?? page.orders
    if (orders === page.orders) return page
    isChanged = true
    return { ...page, orders }
  })
  return isChanged ? { ...data, pages } : data
}
