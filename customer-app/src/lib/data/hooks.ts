import { QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import type { AppOrderDraft, AppOrderSummary } from '@/lib/contract'
import { withTrackedOrder } from '@/lib/orders/list-sync'
import { isTerminalStatus } from '@/lib/orders/status'
import { useSession } from '@/lib/stores/session'
import { useCart } from '@/lib/stores/cart'
import { createPrototypeSource, fixtureSource } from './fixture-source'
import { liveReadsFromEnv } from './live-source'
import type { AppDataSource } from './source'

const FIVE_MINUTES = 5 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: FIVE_MINUTES, gcTime: 2 * FIVE_MINUTES, retry: 2 } },
})

/** Live store + menu when EXPO_PUBLIC_APP_API_URL is set; screens only ever see this. */
const liveReads = liveReadsFromEnv()
const source: AppDataSource = liveReads ? createPrototypeSource(liveReads) : fixtureSource

export const queryKeys = {
  config: ['config'] as const,
  catalog: (outletId: string | null) => ['catalog', outletId] as const,
  loyalty: ['loyalty'] as const,
  orders: ['orders'] as const,
  order: (orderId: string) => ['orders', orderId] as const,
  deliveryQuote: (outletId: string | null, address: string) => ['deliveryQuote', outletId, address] as const,
}

/** How often a live order re-reads its status until it is completed or cancelled. */
const LIVE_ORDER_REFRESH_MS = 5000

export const useAppConfig = () => useQuery({ queryKey: queryKeys.config, queryFn: source.getConfig })

/**
 * The menu for the branch in the bag (prices and dishes can differ per branch).
 * No placeholder across branches: while a new branch loads, screens show
 * skeletons instead of the previous branch's prices (which could be added to the bag).
 */
export function useCatalog() {
  const outletId = useCart((state) => state.outletId)
  return useQuery({ queryKey: queryKeys.catalog(outletId), queryFn: () => source.getCatalog(outletId) })
}

export function useLoyalty() {
  const isMember = useSession((state) => state.status === 'member')
  return useQuery({ queryKey: queryKeys.loyalty, queryFn: source.getLoyalty, enabled: isMember })
}

export function useOrders() {
  const isMember = useSession((state) => state.status === 'member')
  return useQuery({ queryKey: queryKeys.orders, queryFn: source.getOrders, enabled: isMember })
}

export const useOrder = (orderId: string) =>
  useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: async () => {
      const order = await source.getOrder(orderId)
      // Keep the history list in step with what the tracker sees.
      queryClient.setQueryData<AppOrderSummary[]>(queryKeys.orders, (list) => withTrackedOrder(list, order))
      return order
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && isTerminalStatus(status) ? false : LIVE_ORDER_REFRESH_MS
    },
  })

export function usePlaceOrder() {
  return useMutation({
    mutationFn: (draft: AppOrderDraft) => source.placeOrder(draft),
    onSuccess: (order) => {
      queryClient.setQueryData(queryKeys.order(order.id), order)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders, exact: true })
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyalty })
    },
  })
}

export const useVoucherPreview = () => useMutation({ mutationFn: (code: string) => source.previewVoucher(code) })

/** Quotes only once there is an address worth quoting; `address` should be the committed (not mid-typing) value. */
export const useDeliveryQuote = (outletId: string | null, address: string, isEnabled: boolean) =>
  useQuery({
    queryKey: queryKeys.deliveryQuote(outletId, address),
    queryFn: () => source.quoteDelivery(outletId, address),
    enabled: isEnabled && address.trim() !== '',
  })
