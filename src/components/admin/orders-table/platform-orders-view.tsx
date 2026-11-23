'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Owl } from '@/components/mascot/owl'
import { useRealtimeOrders } from '@/hooks/use-realtime-orders'
import { playNotificationSound, requestNotificationPermission, showOrderNotification } from '@/lib/notification-utils'
import { formatPrice } from '@/lib/cart-utils'
import { createCoalescer } from '@/lib/coalesce-calls'
import { formatDailyOrderNumber } from '@/lib/order-number'
import { displayCustomerName } from '@/lib/order-display-name'
import { updateOrderStatusAction } from '@/app/actions/orders'
import type { BranchScope } from '@/lib/outlets/branch-scope'
import type { OrderWithItems } from '@/lib/orders-service'
import { hasNarrowingFilters, ordersTableHref, DATE_RANGE_LABELS, type OrdersTableFilters } from '@/lib/admin/orders-table/filters'
import type { OrdersTableData } from '@/lib/admin/orders-table/read-orders-table'
import { platformOrderRow } from '@/lib/admin/orders-table/row-model'
import { STATUS_META, type NextStatusStep, type OrderStatus } from '@/lib/admin/orders-table/status'
import { OrderDetailPanel } from '@/components/admin/order-detail-panel'
import { OrdersTable } from './orders-table'
import { OrdersToolbar, type ToolbarOption } from './orders-toolbar'
import { OrdersPagination } from './orders-pagination'
import { StatusTabs } from './status-tabs'
import { printOrderReceipt } from './print-receipt'

/**
 * A new order needs a server refresh (the INSERT payload has no items), and a
 * refresh is a full server render. A rush used to fire one per order; a burst
 * now settles into one refresh ~1.5s after it goes quiet, and a never-quiet
 * stream still refreshes at least every 5s. The chime, browser notification
 * and toast stay immediate and per order.
 */
const LIVE_REFRESH = { waitMs: 1500, maxWaitMs: 5000 } as const

const SEARCH_DEBOUNCE_MS = 350
const FRESH_HIGHLIGHT_MS = 6000

export interface PlatformOrdersViewProps {
  data: OrdersTableData
  filters: OrdersTableFilters
  tenantSlug: string
  tenantId: string
  /** Resolved on the server: a branch account is chimed only for its own branch. */
  scope?: BranchScope
}

function withId(set: ReadonlySet<string>, id: string, isIn: boolean): Set<string> {
  const next = new Set(set)
  if (isIn) next.add(id)
  else next.delete(id)
  return next
}

export function PlatformOrdersView({ data, filters, tenantSlug, tenantId, scope }: PlatformOrdersViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isNavigating, startNavigation] = useTransition()

  const [orders, setOrders] = useState<OrderWithItems[]>(data.orders)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set())
  const [nowMs, setNowMs] = useState(() => Date.now())
  // The open order as last seen in the list: it stays readable in the panel
  // after a status change moves it out of the current tab.
  const [selectedSnapshot, setSelectedSnapshot] = useState<OrderWithItems | null>(null)

  // Every server render (navigation, refresh) brings the truth back.
  useEffect(() => setOrders(data.orders), [data.orders])

  useEffect(() => {
    requestNotificationPermission()
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const go = useCallback(
    (patch: Partial<OrdersTableFilters>) => {
      const href = ordersTableHref(pathname, filters, patch)
      startNavigation(() => router.push(href, { scroll: false }))
    },
    [filters, pathname, router],
  )

  // ---- Search: typed locally, sent after a pause ----------------------------
  const [searchText, setSearchText] = useState(filters.q)
  const sentSearch = useRef(filters.q)
  useEffect(() => {
    // Back/forward changed the address: show what it says. A search we sent
    // ourselves is skipped, or a slow reply would overwrite newer typing.
    if (filters.q !== sentSearch.current) {
      sentSearch.current = filters.q
      setSearchText(filters.q)
    }
  }, [filters.q])
  useEffect(() => {
    if (searchText.trim() === sentSearch.current.trim()) return
    const timer = window.setTimeout(() => {
      sentSearch.current = searchText.trim()
      go({ q: searchText.trim() })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchText, go])

  // ---- Live updates ----------------------------------------------------------
  const refreshCoalescer = useMemo(() => createCoalescer(() => router.refresh(), LIVE_REFRESH), [router])
  useEffect(() => () => refreshCoalescer.cancel(), [refreshCoalescer])

  const handleNewOrder = useCallback(
    (newOrder: Record<string, unknown>) => {
      const id = String(newOrder.id)
      playNotificationSound()
      showOrderNotification({
        id,
        customer_name: newOrder.customer_name as string | undefined,
        total: Number(newOrder.total),
        order_type: newOrder.order_type as string | undefined,
      })
      const number = formatDailyOrderNumber(newOrder.daily_number as number | null | undefined, id)
      toast.success(`New order ${number}`, {
        description: `${displayCustomerName(newOrder.customer_name as string | undefined)} · ${formatPrice(Number(newOrder.total))}`,
        duration: 8000,
      })
      setFreshIds((current) => withId(current, id, true))
      window.setTimeout(() => setFreshIds((current) => withId(current, id, false)), FRESH_HIGHLIGHT_MS)
      refreshCoalescer.schedule()
    },
    [refreshCoalescer],
  )

  // The rows as last rendered, read by the realtime handler without re-subscribing.
  const ordersRef = useRef(orders)
  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  const handleOrderUpdate = useCallback(
    (updated: Record<string, unknown>) => {
      const known = ordersRef.current.find((order) => order.id === updated.id)
      setOrders((current) => current.map((order) => (order.id === updated.id ? ({ ...order, ...updated } as OrderWithItems) : order)))
      // The tab counts (and whether the row still belongs in this tab) come
      // from the server, so only a change that can move them asks for one: a
      // new status or payment state, or an order this page does not hold.
      // Rider updates, notes and edits on a row in view are patched in place.
      const mayMoveCounts = !known || updated.status !== known.status || updated.payment_status !== known.payment_status
      if (mayMoveCounts) refreshCoalescer.schedule()
    },
    [refreshCoalescer],
  )

  const { isConnected } = useRealtimeOrders({ tenantId, onNewOrder: handleNewOrder, onOrderUpdate: handleOrderUpdate, scope })

  // ---- Rows, selection and the one-tap step ----------------------------------
  const typeKinds = useMemo(
    () => Object.fromEntries(data.orderTypes.filter((t) => t.type).map((t) => [t.id, t.type as string])),
    [data.orderTypes],
  )
  const outletNames = useMemo(() => Object.fromEntries(data.outlets.map((o) => [o.id, o.name])), [data.outlets])
  const rows = useMemo(() => orders.map((order) => platformOrderRow(order, { typeKinds, outletNames })), [orders, typeKinds, outletNames])

  const selectedIndex = selectedId ? orders.findIndex((order) => order.id === selectedId) : -1
  const liveSelected = selectedIndex >= 0 ? orders[selectedIndex] : null
  useEffect(() => {
    if (liveSelected) setSelectedSnapshot(liveSelected)
  }, [liveSelected])
  const selectedOrder = selectedId ? (liveSelected ?? (selectedSnapshot?.id === selectedId ? selectedSnapshot : null)) : null

  // Takes the order itself: the panel can hold an order that a refresh has
  // already moved out of this tab, and its next step must still work.
  const advance = useCallback(
    async (before: OrderWithItems, step: NextStatusStep) => {
      const orderId = before.id
      const patchStatus = (status: OrderWithItems['status']) => {
        setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, status } : order)))
        setSelectedSnapshot((current) => (current?.id === orderId ? { ...current, status } : current))
      }
      setBusyIds((current) => withId(current, orderId, true))
      patchStatus(step.status)
      const result = await updateOrderStatusAction(orderId, tenantId, tenantSlug, step.status)
      setBusyIds((current) => withId(current, orderId, false))
      const number = formatDailyOrderNumber(before.daily_number ?? before.daily_order_number, before.id)
      if (!result.success) {
        patchStatus(before.status)
        toast.error(result.error || `Could not update order ${number}`)
        return
      }
      toast.success(`Order ${number} · ${STATUS_META[step.status].label}`)
      // Not a navigation: the table stays tappable while the counts catch up,
      // and the realtime UPDATE for this same change joins this one refresh.
      refreshCoalescer.schedule()
    },
    [refreshCoalescer, tenantId, tenantSlug],
  )

  const typeOptions: ToolbarOption[] = useMemo(() => {
    const names = new Set(data.orderTypes.map((t) => t.name.trim()))
    if (filters.type) names.add(filters.type)
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }))
  }, [data.orderTypes, filters.type])
  const branchOptions: ToolbarOption[] = data.outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))

  const isFiltered = hasNarrowingFilters(filters)
  const rangeLabel = DATE_RANGE_LABELS[filters.range].toLowerCase()

  const empty = (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Owl state="waiting" size={96} />
      {isFiltered || filters.status !== 'all' ? (
        <>
          <p className="text-[16px] font-bold text-wn-ink">No orders match</p>
          <p className="max-w-sm text-[14px] text-wn-stone">
            Nothing {filters.status === 'all' ? '' : `${STATUS_META[filters.status].label.toLowerCase()} `}for {rangeLabel} with these filters.
          </p>
          <button
            type="button"
            onClick={() => {
              sentSearch.current = ''
              setSearchText('')
              go({ status: 'all', type: null, branch: null, payment: 'all', q: '' })
            }}
            className="min-h-10 rounded-xl bg-wn-ink px-4 text-[14px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2"
          >
            Show every order
          </button>
        </>
      ) : (
        <>
          <p className="text-[16px] font-bold text-wn-ink">{filters.range === 'today' ? 'No orders yet today' : `No orders for ${rangeLabel}`}</p>
          <p className="max-w-sm text-[14px] text-wn-stone">New orders appear here the moment they come in.</p>
          {filters.range !== '30d' && filters.range !== 'all' && (
            <button
              type="button"
              onClick={() => go({ range: filters.range === '7d' ? '30d' : '7d' })}
              className="min-h-10 rounded-xl bg-white px-4 text-[14px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              {filters.range === '7d' ? 'See the last 30 days' : 'See the last 7 days'}
            </button>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <StatusTabs value={filters.status} counts={data.counts} onSelect={(status: OrderStatus | 'all') => go({ status })} />
        </div>
        <p className="mb-3 hidden shrink-0 items-center gap-2 text-[13px] text-wn-stone md:flex" role="status">
          <span className={isConnected ? 'size-2 animate-pulse rounded-full bg-emerald-500' : 'size-2 rounded-full bg-wn-line'} aria-hidden />
          {isConnected ? 'Live' : 'Connecting…'}
        </p>
      </div>

      <OrdersToolbar
        search={searchText}
        onSearch={setSearchText}
        range={filters.range}
        onRange={(range) => go({ range })}
        type={filters.type}
        typeOptions={typeOptions}
        onType={(type) => go({ type })}
        branch={filters.branch}
        branchOptions={branchOptions}
        onBranch={(branch) => go({ branch })}
        payment={filters.payment}
        onPayment={(payment) => go({ payment })}
        onClear={
          isFiltered
            ? () => {
                sentSearch.current = ''
                setSearchText('')
                go({ type: null, branch: null, payment: 'all', q: '' })
              }
            : undefined
        }
      />

      <OrdersTable
        rows={rows}
        nowMs={nowMs}
        onOpen={setSelectedId}
        onAdvance={
          data.canChangeOrders
            ? (row, step) => {
                const order = orders.find((candidate) => candidate.id === row.id)
                if (order) void advance(order, step)
              }
            : undefined
        }
        onPrint={(id) => {
          const order = orders.find((candidate) => candidate.id === id)
          if (order) void printOrderReceipt(order, tenantId, tenantSlug)
        }}
        selectedId={selectedId}
        freshIds={freshIds}
        busyIds={busyIds}
        hasItemNames
        isLoading={isNavigating}
        empty={empty}
        caption={`Orders, ${rangeLabel}. Select an order to open it.`}
      />

      <OrdersPagination
        page={data.page}
        pageSize={data.pageSize}
        totalCount={data.totalCount}
        totalPages={data.totalPages}
        onPage={(page) => go({ page })}
      />

      <OrderDetailPanel
        order={selectedOrder}
        tenantSlug={tenantSlug}
        tenantId={tenantId}
        onClose={() => setSelectedId(null)}
        onPrevious={selectedIndex > 0 ? () => setSelectedId(orders[selectedIndex - 1].id) : undefined}
        onNext={selectedIndex >= 0 && selectedIndex < orders.length - 1 ? () => setSelectedId(orders[selectedIndex + 1].id) : undefined}
        onAdvance={data.canChangeOrders ? (order, step) => void advance(order, step) : undefined}
        canChangeOrders={data.canChangeOrders}
        rowContext={{ typeKinds, outletNames }}
        isAdvancing={selectedId ? busyIds.has(selectedId) : false}
        onOrderChanged={(orderId, patch) => {
          setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, ...patch } : order)))
          setSelectedSnapshot((current) => (current?.id === orderId ? { ...current, ...patch } : current))
        }}
      />
    </div>
  )
}
