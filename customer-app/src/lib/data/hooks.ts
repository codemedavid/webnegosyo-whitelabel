import { QueryClient, useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/stores/session'
import { fixtureSource } from './fixture-source'
import type { AppDataSource } from './source'

const FIVE_MINUTES = 5 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: FIVE_MINUTES, gcTime: 2 * FIVE_MINUTES, retry: 2 } },
})

/** Swapped for the HTTP client in Phase 2; screens only ever see this. */
const source: AppDataSource = fixtureSource

export const queryKeys = {
  config: ['config'] as const,
  catalog: ['catalog'] as const,
  loyalty: ['loyalty'] as const,
  orders: ['orders'] as const,
  order: (orderId: string) => ['orders', orderId] as const,
}

export const useAppConfig = () => useQuery({ queryKey: queryKeys.config, queryFn: source.getConfig })

export const useCatalog = () => useQuery({ queryKey: queryKeys.catalog, queryFn: source.getCatalog })

export function useLoyalty() {
  const isMember = useSession((state) => state.status === 'member')
  return useQuery({ queryKey: queryKeys.loyalty, queryFn: source.getLoyalty, enabled: isMember })
}

export function useOrders() {
  const isMember = useSession((state) => state.status === 'member')
  return useQuery({ queryKey: queryKeys.orders, queryFn: source.getOrders, enabled: isMember })
}

export const useOrder = (orderId: string) =>
  useQuery({ queryKey: queryKeys.order(orderId), queryFn: () => source.getOrder(orderId) })
