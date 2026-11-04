import { QueryClient, keepPreviousData, useInfiniteQuery, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query'
import { AppApiError } from '@/lib/api/app-client'
import type {
  AppDeliveryQuoteRequest,
  AppErrorCode,
  AppOrderDraft,
  AppOrderPage,
  AppVoucherPreviewRequest,
} from '@/lib/contract'
import { flattenOrderPages, withTrackedOrderInPages, type OrderPages } from '@/lib/orders/list-sync'
import { orderPollInterval } from '@/lib/orders/polling'
import { useCart } from '@/lib/stores/cart'
import { useSession } from '@/lib/stores/session'
import { createPrototypeSource, fixtureSource } from './fixture-source'
import { liveSourceFromEnv } from './live-source'
import type { AppDataSource } from './source'

const FIVE_MINUTES = 5 * 60 * 1000
const ONE_MINUTE = 60 * 1000

/** Answers that asking again won't change (the store said no, or the input is wrong). */
const DEFINITE_ERRORS: ReadonlySet<AppErrorCode> = new Set(['bad_request', 'unauthorized', 'forbidden', 'not_found', 'refused', 'rate_limited'])
const MAX_RETRIES = 2

export const isDefiniteError = (error: unknown) => error instanceof AppApiError && DEFINITE_ERRORS.has(error.code)
const retryUnlessDefinite = (failureCount: number, error: unknown) => !isDefiniteError(error) && failureCount < MAX_RETRIES

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: FIVE_MINUTES, gcTime: 2 * FIVE_MINUTES, retry: retryUnlessDefinite } },
})

/** Live store when EXPO_PUBLIC_APP_API_URL is set (loyalty stays prototype until its phase); screens only ever see this. */
const live = liveSourceFromEnv()
const source: AppDataSource = live ? { ...createPrototypeSource(live), ...live } : fixtureSource

/**
 * Rewards at checkout arrive in Phase 5: until then the order route refuses any
 * `rewardId`, so a live store never offers the (still prototype) reward there.
 */
export const isRewardAtCheckoutOffered = live === null

export const queryKeys = {
  config: ['config'] as const,
  catalog: (outletId: string | null) => ['catalog', outletId] as const,
  loyalty: ['loyalty'] as const,
  /** Prefix of every per-customer order read (history pages + order details). */
  orders: ['orders'] as const,
  orderList: ['orders', 'list'] as const,
  order: (orderId: string) => ['orders', 'detail', orderId] as const,
  deliveryQuote: (request: AppDeliveryQuoteRequest) => ['deliveryQuote', request.outletId, request.address, request.lat, request.lng] as const,
  places: (query: string | null, outletId: string | null) => ['places', outletId, query] as const,
  voucherPreview: (key: string | null) => ['voucherPreview', key] as const,
}

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

/** The customer's app orders, newest first, one page (20) at a time; `data` is every loaded page as one list. */
export function useOrders() {
  const isMember = useSession((state) => state.status === 'member')
  return useInfiniteQuery({
    queryKey: queryKeys.orderList,
    queryFn: ({ pageParam }) => source.getOrders(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: AppOrderPage) => lastPage.nextCursor,
    select: (data: InfiniteData<AppOrderPage, string | null>) => flattenOrderPages(data),
    enabled: isMember,
  })
}

interface OrderVisibility {
  isFocused: boolean
  isAppActive: boolean
}

/** One order, re-read every 15 s while it is on screen and can still change. */
export const useOrder = (orderId: string, visibility: OrderVisibility) =>
  useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: async () => {
      const order = await source.getOrder(orderId)
      // Keep the history list in step with what the tracker sees.
      queryClient.setQueryData<OrderPages>(queryKeys.orderList, (pages) => withTrackedOrderInPages(pages, order))
      return order
    },
    refetchInterval: (query) => orderPollInterval({ status: query.state.data?.status, ...visibility }),
  })

export function usePlaceOrder() {
  return useMutation({
    mutationFn: ({ draft, idempotencyKey }: { draft: AppOrderDraft; idempotencyKey: string }) => source.placeOrder(draft, idempotencyKey),
    onSuccess: (order) => {
      queryClient.setQueryData(queryKeys.order(order.id), order)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderList, exact: true })
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyalty })
    },
  })
}

/** Checking a newly typed code against this bag. */
export const useVoucherCheck = () => useMutation({ mutationFn: (request: AppVoucherPreviewRequest) => source.previewVoucher(request) })

/** The applied code's answer for the bag as it is now; `key` from `voucherPreviewKey`. */
export const useVoucherPreview = (request: AppVoucherPreviewRequest | null, key: string | null, isSettled: boolean) =>
  useQuery({
    queryKey: queryKeys.voucherPreview(key),
    queryFn: () => (request ? source.previewVoucher(request) : Promise.resolve(null)),
    enabled: request !== null && isSettled,
    // The last bag's answer stays up (as "checking") while the new one loads, so the row never jumps.
    placeholderData: keepPreviousData,
    staleTime: ONE_MINUTE,
  })

/** Seeds the preview cache with the answer the Apply tap already got, so applying shows it at once. */
export const rememberVoucherPreview = (key: string, preview: Awaited<ReturnType<AppDataSource['previewVoucher']>>) =>
  queryClient.setQueryData(queryKeys.voucherPreview(key), preview)

export const hasVoucherPreview = (key: string | null) => key !== null && queryClient.getQueryData(queryKeys.voucherPreview(key)) !== undefined

/** The fee to the picked place; null = no place picked (or not a delivery). */
export const useDeliveryQuote = (request: AppDeliveryQuoteRequest | null) =>
  useQuery({
    queryKey: request ? queryKeys.deliveryQuote(request) : ['deliveryQuote', null],
    queryFn: () => (request ? source.quoteDelivery(request) : Promise.reject(new AppApiError('bad_request', 'No address'))),
    enabled: request !== null,
  })

/** Address type-ahead for an already-debounced query (null = nothing to search). */
export const usePlaces = (query: string | null, outletId: string | null) =>
  useQuery({
    queryKey: queryKeys.places(query, outletId),
    queryFn: () => (query ? source.searchPlaces({ q: query, outletId }) : Promise.resolve([])),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    // Each search spends the store's map quota: never retry one on its own.
    retry: false,
  })
