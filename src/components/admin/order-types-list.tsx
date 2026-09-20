'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, Eye, EyeOff, Settings, Users, ChevronUp, ChevronDown, CalendarClock, Globe, Monitor, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toggleOrderTypeEnabledAction, toggleOrderTypeAdvanceOrderAction, deleteOrderTypeAction, reorderOrderTypesAction, initializeDefaultOrderTypesAction } from '@/app/actions/order-types'
import { toast } from 'sonner'
import { useEffect } from 'react'
import type { OrderType, CustomerFormField } from '@/types/database'
import { ORDER_TYPE_KIND_LABELS, type OrderTypeKind } from '@/lib/order-types/order-type-kinds'
import {
  readClientEnvironment,
  runServerAction,
  shouldDeferRefresh,
  type ServerActionOutcome,
} from '@/components/admin/server-action-safety'

interface OrderTypesListProps {
  orderTypes: (OrderType & { customer_form_fields: CustomerFormField[] })[]
  tenantSlug: string
  tenantId: string
}

const orderTypeIcons: Record<OrderTypeKind, string> = {
  dine_in: '🍽️',
  pickup: '📦',
  delivery: '🚚',
  grab: '🛵',
  foodpanda: '🐼',
  other: '🏪',
}

const orderTypeColors: Record<OrderTypeKind, string> = {
  dine_in: 'bg-green-100 text-green-800 border-green-300',
  pickup: 'bg-blue-100 text-blue-800 border-blue-300',
  delivery: 'bg-orange-100 text-orange-800 border-orange-300',
  grab: 'bg-teal-100 text-teal-800 border-teal-300',
  foodpanda: 'bg-pink-100 text-pink-800 border-pink-300',
  other: 'bg-gray-100 text-gray-800 border-gray-300',
}

/** Rows saved before the availability columns existed arrive undefined and mean "on". */
const isOn = (flag: boolean | undefined) => flag !== false

export function OrderTypesList({ orderTypes, tenantSlug, tenantId }: OrderTypesListProps) {
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orderTypeToDelete, setOrderTypeToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  /**
   * The last write that never reached the server. Shown inline with a retry so
   * a dropped request costs the merchant one tap, not a crash screen.
   */
  const [failure, setFailure] = useState<{ message: string; retry: () => void } | null>(null)
  const [sortedOrderTypes, setSortedOrderTypes] = useState(
    [...orderTypes].sort((a, b) => a.order_index - b.order_index)
  )

  // Update sorted order when orderTypes prop changes
  useEffect(() => {
    setSortedOrderTypes([...orderTypes].sort((a, b) => a.order_index - b.order_index))
  }, [orderTypes])

  /*
   * A `router.refresh()` is an RSC fetch. Started while the tab is hidden — an
   * iPhone merchant switching apps mid-toggle — iOS kills the request, the
   * half-decoded flight stream throws above every route error boundary, and the
   * merchant comes back to a full crash screen for what was only a
   * backgrounding. Hold the refresh until the tab is visible instead.
   */
  const isRefreshPendingRef = useRef(false)

  const requestRefresh = useCallback(() => {
    if (shouldDeferRefresh(readClientEnvironment().visibility)) {
      isRefreshPendingRef.current = true
      return
    }
    router.refresh()
  }, [router])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const flushPendingRefresh = () => {
      if (!isRefreshPendingRef.current) return
      if (shouldDeferRefresh(readClientEnvironment().visibility)) return
      isRefreshPendingRef.current = false
      router.refresh()
    }
    document.addEventListener('visibilitychange', flushPendingRefresh)
    return () => document.removeEventListener('visibilitychange', flushPendingRefresh)
  }, [router])

  /**
   * Run one order-type write. Returns the action's own result when it landed,
   * and otherwise records a retryable failure banner — never a rejection, so a
   * dropped request can never reach the global error boundary as a crash.
   */
  const runWrite = useCallback(
    async <T,>(
      invoke: () => Promise<T>,
      retry: () => void,
    ): Promise<ServerActionOutcome<T>> => {
      const outcome = await runServerAction(invoke)
      if (!outcome.ok) setFailure({ message: outcome.message, retry })
      else setFailure(null)
      return outcome
    },
    [],
  )

  const handleToggleEnabled = async (orderTypeId: string, currentEnabled: boolean) => {
    const outcome = await runWrite(
      () => toggleOrderTypeEnabledAction(orderTypeId, tenantId, tenantSlug, !currentEnabled),
      () => void handleToggleEnabled(orderTypeId, currentEnabled),
    )
    if (!outcome.ok) return

    if (outcome.value.success) {
      toast.success(`Order type ${!currentEnabled ? 'enabled' : 'disabled'}`)
      requestRefresh()
    } else {
      toast.error(outcome.value.error || 'Failed to update order type')
    }
  }

  const handleToggleAdvanceOrder = async (orderTypeId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled

    // Optimistic local update
    setSortedOrderTypes(prev =>
      prev.map(ot => (ot.id === orderTypeId ? { ...ot, advance_order_enabled: nextEnabled } : ot))
    )

    const revert = () =>
      setSortedOrderTypes(prev =>
        prev.map(ot => (ot.id === orderTypeId ? { ...ot, advance_order_enabled: currentEnabled } : ot))
      )

    const outcome = await runWrite(
      () => toggleOrderTypeAdvanceOrderAction(orderTypeId, tenantId, tenantSlug, nextEnabled),
      () => void handleToggleAdvanceOrder(orderTypeId, currentEnabled),
    )
    if (!outcome.ok) {
      revert()
      return
    }

    if (outcome.value.success) {
      toast.success(`Pre-order ${nextEnabled ? 'enabled' : 'disabled'}`)
      requestRefresh()
    } else {
      revert()
      toast.error(outcome.value.error || 'Failed to update pre-order')
    }
  }

  const handleInitializeDefaults = async () => {
    setIsInitializing(true)
    const outcome = await runWrite(
      () => initializeDefaultOrderTypesAction(tenantId, tenantSlug),
      () => void handleInitializeDefaults(),
    )
    setIsInitializing(false)
    if (!outcome.ok) return

    if (outcome.value.success) {
      toast.success('Default order types created')
      requestRefresh()
    } else {
      toast.error(outcome.value.error || 'Failed to create default order types')
    }
  }

  const handleDelete = async () => {
    if (!orderTypeToDelete) return
    const targetId = orderTypeToDelete

    setIsDeleting(true)
    const outcome = await runWrite(
      () => deleteOrderTypeAction(targetId, tenantId, tenantSlug),
      () => void handleDelete(),
    )
    setIsDeleting(false)
    if (!outcome.ok) return

    if (outcome.value.success) {
      toast.success('Order type deleted successfully')
      setDeleteDialogOpen(false)
      setOrderTypeToDelete(null)
      requestRefresh()
    } else {
      toast.error(outcome.value.error || 'Failed to delete order type')
    }
  }

  const handleMove = async (orderTypeId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedOrderTypes.findIndex(ot => ot.id === orderTypeId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= sortedOrderTypes.length) return

    const newOrder = [...sortedOrderTypes]
    const [moved] = newOrder.splice(currentIndex, 1)
    newOrder.splice(newIndex, 0, moved)

    // Update order_index for all order types
    const orderTypeIds = newOrder.map(ot => ot.id)

    const outcome = await runWrite(
      () => reorderOrderTypesAction(orderTypeIds, tenantId, tenantSlug),
      () => void handleMove(orderTypeId, direction),
    )
    if (!outcome.ok) return

    if (outcome.value.success) {
      setSortedOrderTypes(newOrder)
      toast.success('Order type order updated')
      requestRefresh()
    } else {
      toast.error(outcome.value.error || 'Failed to reorder order types')
    }
  }

  const failureBanner = failure && (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {failure.message}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
        onClick={() => {
          const { retry } = failure
          setFailure(null)
          retry()
        }}
      >
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  )

  if (orderTypes.length === 0) {
    return (
      <>
      {failureBanner}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Plus className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No order types configured</h3>
          <p className="text-muted-foreground mb-4 text-center">
            Get started instantly with Dine In, Pick Up, and Delivery — each preconfigured with the
            right customer fields. Or add a single custom order type yourself.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Button onClick={handleInitializeDefaults} disabled={isInitializing}>
              <Plus className="mr-2 h-4 w-4" />
              {isInitializing ? 'Creating...' : 'Add default order types'}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/${tenantSlug}/admin/order-types/new`)}
              disabled={isInitializing}
            >
              Add custom order type
            </Button>
          </div>
        </CardContent>
      </Card>
      </>
    )
  }

  return (
    <>
      {failureBanner}
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => router.push(`/${tenantSlug}/admin/order-types/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Order Type
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {sortedOrderTypes.map((orderType, index) => (
          <Card key={orderType.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="text-lg flex-shrink-0">{orderTypeIcons[orderType.type]}</div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm sm:text-base truncate">{orderType.name}</CardTitle>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge className={`${orderTypeColors[orderType.type]} text-[10px]`} variant="outline">
                    {ORDER_TYPE_KIND_LABELS[orderType.type]}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {isOn(orderType.available_on_web) && (
                      <Badge className="text-[10px]" variant="secondary" title="Shown on the web storefront">
                        <Globe className="mr-0.5 h-2.5 w-2.5" />
                        Web
                      </Badge>
                    )}
                    {isOn(orderType.available_on_pos) && (
                      <Badge className="text-[10px]" variant="secondary" title="Shown on the register">
                        <Monitor className="mr-0.5 h-2.5 w-2.5" />
                        POS
                      </Badge>
                    )}
                  </div>
                  {orderType.advance_order_enabled && (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-[10px]" variant="outline">
                      <CalendarClock className="mr-0.5 h-2.5 w-2.5" />
                      Pre-order
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {orderType.customer_form_fields.length} field{orderType.customer_form_fields.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMove(orderType.id, 'up')}
                    disabled={index === 0}
                    title="Move up"
                    className="h-6 w-6"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMove(orderType.id, 'down')}
                    disabled={index === sortedOrderTypes.length - 1}
                    title="Move down"
                    className="h-6 w-6"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={orderType.is_enabled ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => handleToggleEnabled(orderType.id, orderType.is_enabled)}
                    className="text-[10px] h-6 px-2"
                  >
                    {orderType.is_enabled ? (
                      <>
                        <Eye className="mr-0.5 h-3 w-3" />
                        On
                      </>
                    ) : (
                      <>
                        <EyeOff className="mr-0.5 h-3 w-3" />
                        Off
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-md bg-purple-50/60 px-2 py-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CalendarClock className="h-3.5 w-3.5 text-purple-700 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground truncate">
                    Let customers schedule this for later
                  </span>
                </div>
                <Button
                  variant={orderType.advance_order_enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleAdvanceOrder(orderType.id, orderType.advance_order_enabled)}
                  className={`text-[10px] h-6 px-2 flex-shrink-0 ${orderType.advance_order_enabled ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'border-purple-300 text-purple-700'}`}
                  title="Toggle pre-order (scheduled orders)"
                >
                  {orderType.advance_order_enabled ? 'Pre-order On' : 'Pre-order Off'}
                </Button>
              </div>

              <div className="flex gap-2">
                <Link href={`/${tenantSlug}/admin/order-types/${orderType.id}`} className="flex-1">
                  <Button variant="outline" className="w-full text-xs h-8">
                    <Settings className="mr-1 h-3 w-3" />
                    Configure
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive h-8 w-8"
                  onClick={() => {
                    setOrderTypeToDelete(orderType.id)
                    setDeleteDialogOpen(true)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the order type and all its form fields.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
