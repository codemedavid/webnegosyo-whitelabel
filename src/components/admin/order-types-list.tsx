'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Globe,
  Monitor,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
import {
  toggleOrderTypeEnabledAction,
  toggleOrderTypeAdvanceOrderAction,
  deleteOrderTypeAction,
  reorderOrderTypesAction,
  initializeDefaultOrderTypesAction,
} from '@/app/actions/order-types'
import { toast } from 'sonner'
import type { OrderType, CustomerFormField } from '@/types/database'
import { ORDER_TYPE_KIND_LABELS } from '@/lib/order-types/order-type-kinds'
import { ORDER_TYPE_ACCENTS } from '@/lib/order-types/order-type-accents'
import {
  readClientEnvironment,
  runServerAction,
  shouldDeferRefresh,
  type ServerActionOutcome,
} from '@/components/admin/server-action-safety'

type OrderTypeRow = OrderType & { customer_form_fields: CustomerFormField[] }

interface OrderTypesListProps {
  orderTypes: OrderTypeRow[]
  tenantSlug: string
  tenantId: string
}

/** Rows saved before the availability columns existed arrive undefined and mean "on". */
const isOn = (flag: boolean | undefined) => flag !== false

function signature(rows: readonly OrderTypeRow[]): string {
  return JSON.stringify(
    rows.map((row) => [
      row.id,
      row.name,
      row.order_index,
      row.is_enabled,
      row.advance_order_enabled,
      row.available_on_web,
      row.available_on_pos,
      row.customer_form_fields.length,
    ])
  )
}

export function OrderTypesList({ orderTypes, tenantSlug, tenantId }: OrderTypesListProps) {
  const router = useRouter()
  const [orderTypeToDelete, setOrderTypeToDelete] = useState<OrderTypeRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  /*
   * Reorder writes the WHOLE order as an absolute array, so two overlapping
   * calls race: whichever lands last wins and silently undoes part of the move
   * the merchant just made, with both calls reporting success. Tapping "up"
   * three times quickly is exactly how that happens.
   */
  const [isReordering, setIsReordering] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  /**
   * The last write that never reached the server. Shown inline with a retry so
   * a dropped request costs the merchant one tap, not a crash screen.
   */
  const [failure, setFailure] = useState<{ message: string; retry: () => void } | null>(null)

  const serverRows = useMemo(
    () => [...orderTypes].sort((a, b) => a.order_index - b.order_index),
    [orderTypes]
  )
  const [rows, setRows] = useState<OrderTypeRow[]>(serverRows)
  const appliedRef = useRef(signature(serverRows))

  // Resync only when the server list actually differs, so an optimistic toggle
  // is not clobbered by an unrelated re-render.
  useEffect(() => {
    const next = signature(serverRows)
    if (next === appliedRef.current) return
    appliedRef.current = next
    setRows(serverRows)
  }, [serverRows])

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
    async <T,>(invoke: () => Promise<T>, retry: () => void): Promise<ServerActionOutcome<T>> => {
      const outcome = await runServerAction(invoke)
      if (!outcome.ok) setFailure({ message: outcome.message, retry })
      else setFailure(null)
      return outcome
    },
    []
  )

  /** Flip one boolean column optimistically, reverting if the server refuses. */
  const toggleFlag = async (
    orderTypeId: string,
    column: 'is_enabled' | 'advance_order_enabled',
    nextValue: boolean,
    invoke: () => Promise<{ success: boolean; error?: string }>,
    retry: () => void,
    { successMessage, errorMessage }: { successMessage: string; errorMessage: string }
  ) => {
    const apply = (value: boolean) =>
      setRows((prev) =>
        prev.map((row) => (row.id === orderTypeId ? { ...row, [column]: value } : row))
      )

    apply(nextValue)

    const outcome = await runWrite(invoke, retry)
    if (!outcome.ok) {
      apply(!nextValue)
      return
    }

    if (outcome.value.success) {
      toast.success(successMessage)
      requestRefresh()
    } else {
      apply(!nextValue)
      toast.error(outcome.value.error || errorMessage)
    }
  }

  const handleToggleEnabled = (orderTypeId: string, currentEnabled: boolean) => {
    const next = !currentEnabled
    return toggleFlag(
      orderTypeId,
      'is_enabled',
      next,
      () => toggleOrderTypeEnabledAction(orderTypeId, tenantId, tenantSlug, next),
      () => void handleToggleEnabled(orderTypeId, currentEnabled),
      {
        successMessage: next ? 'Order type is live' : 'Order type hidden',
        errorMessage: 'Failed to update order type',
      }
    )
  }

  const handleToggleAdvanceOrder = (orderTypeId: string, currentEnabled: boolean) => {
    const next = !currentEnabled
    return toggleFlag(
      orderTypeId,
      'advance_order_enabled',
      next,
      () => toggleOrderTypeAdvanceOrderAction(orderTypeId, tenantId, tenantSlug, next),
      () => void handleToggleAdvanceOrder(orderTypeId, currentEnabled),
      {
        successMessage: next ? 'Pre-orders enabled' : 'Pre-orders disabled',
        errorMessage: 'Failed to update pre-order',
      }
    )
  }

  const handleInitializeDefaults = async () => {
    setIsInitializing(true)
    const outcome = await runWrite(
      () => initializeDefaultOrderTypesAction(tenantId, tenantSlug),
      () => void handleInitializeDefaults()
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
    const target = orderTypeToDelete

    setIsDeleting(true)
    const outcome = await runWrite(
      () => deleteOrderTypeAction(target.id, tenantId, tenantSlug),
      () => void handleDelete()
    )
    setIsDeleting(false)
    if (!outcome.ok) return

    if (outcome.value.success) {
      setRows((prev) => prev.filter((row) => row.id !== target.id))
      toast.success(`"${target.name}" deleted`)
      setOrderTypeToDelete(null)
      requestRefresh()
    } else {
      toast.error(outcome.value.error || 'Failed to delete order type')
    }
  }

  const handleMove = async (orderTypeId: string, direction: 'up' | 'down') => {
    if (isReordering) return
    const currentIndex = rows.findIndex((row) => row.id === orderTypeId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= rows.length) return

    const previous = rows
    const reordered = [...rows]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(newIndex, 0, moved)

    // Move first, confirm after — an arrow that waits on a round trip reads as dead.
    setRows(reordered.map((row, index) => ({ ...row, order_index: index })))
    setIsReordering(true)

    const outcome = await runWrite(
      () => reorderOrderTypesAction(reordered.map((row) => row.id), tenantId, tenantSlug),
      () => void handleMove(orderTypeId, direction)
    )
    setIsReordering(false)
    if (!outcome.ok) {
      setRows(previous)
      return
    }

    if (outcome.value.success) {
      requestRefresh()
    } else {
      setRows(previous)
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

  if (rows.length === 0) {
    return (
      <>
        {failureBanner}
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <h3 className="text-lg font-semibold">No order types configured</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Until there is at least one, customers have no way to say how they want their order.
            Start with Dine In, Pick Up and Delivery — each comes preconfigured with the right
            checkout fields.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button onClick={handleInitializeDefaults} disabled={isInitializing}>
              <Plus className="mr-2 h-4 w-4" />
              {isInitializing ? 'Creating…' : 'Add the three defaults'}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/${tenantSlug}/admin/order-types/new`)}
              disabled={isInitializing}
            >
              Add a custom one instead
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {failureBanner}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} order type{rows.length === 1 ? '' : 's'} · shown to customers in this order
        </p>
        <Button onClick={() => router.push(`/${tenantSlug}/admin/order-types/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Add order type
        </Button>
      </div>

      <ul className="space-y-3">
        {rows.map((orderType, index) => {
          const accent = ORDER_TYPE_ACCENTS[orderType.type]
          const fieldCount = orderType.customer_form_fields.length

          return (
            <li
              key={orderType.id}
              className={`rounded-xl border bg-card shadow-sm transition-opacity ${
                orderType.is_enabled ? '' : 'opacity-70'
              }`}
            >
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                {/* Reorder */}
                <div className="hidden flex-col sm:flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleMove(orderType.id, 'up')}
                    disabled={index === 0 || isReordering}
                    aria-label={`Move ${orderType.name} up`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleMove(orderType.id, 'down')}
                    disabled={index === rows.length - 1 || isReordering}
                    aria-label={`Move ${orderType.name} down`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Identity */}
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl ${accent.tile}`}
                    aria-hidden="true"
                  >
                    {accent.emoji}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/${tenantSlug}/admin/order-types/${orderType.id}`}
                      className="truncate text-base font-semibold hover:underline"
                    >
                      {orderType.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={`font-normal ${accent.badge}`}>
                        {ORDER_TYPE_KIND_LABELS[orderType.type]}
                      </Badge>
                      {isOn(orderType.available_on_web) && (
                        <Badge variant="outline" className="font-normal">
                          <Globe className="mr-1 h-3 w-3" />
                          Web
                        </Badge>
                      )}
                      {isOn(orderType.available_on_pos) && (
                        <Badge variant="outline" className="font-normal">
                          <Monitor className="mr-1 h-3 w-3" />
                          Register
                        </Badge>
                      )}
                      <Badge variant="outline" className="font-normal">
                        <Users className="mr-1 h-3 w-3" />
                        {fieldCount} field{fieldCount === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Switches */}
                <div className="grid shrink-0 gap-3 sm:w-[19rem] sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <Label
                      htmlFor={`enabled-${orderType.id}`}
                      className="cursor-pointer flex-col items-start gap-0"
                    >
                      <span className="text-sm font-medium">
                        {orderType.is_enabled ? 'Live' : 'Hidden'}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">Visibility</span>
                    </Label>
                    <Switch
                      id={`enabled-${orderType.id}`}
                      checked={orderType.is_enabled}
                      onCheckedChange={() =>
                        handleToggleEnabled(orderType.id, orderType.is_enabled)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <Label
                      htmlFor={`preorder-${orderType.id}`}
                      className="cursor-pointer flex-col items-start gap-0"
                    >
                      <span className="flex items-center gap-1 text-sm font-medium">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Pre-order
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {orderType.advance_order_enabled ? 'Schedulable' : 'Now only'}
                      </span>
                    </Label>
                    <Switch
                      id={`preorder-${orderType.id}`}
                      checked={orderType.advance_order_enabled}
                      onCheckedChange={() =>
                        handleToggleAdvanceOrder(orderType.id, orderType.advance_order_enabled)
                      }
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/${tenantSlug}/admin/order-types/${orderType.id}`}>
                    <Button variant="outline" size="sm">
                      <Settings className="mr-1.5 h-4 w-4" />
                      Configure
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setOrderTypeToDelete(orderType)}
                    aria-label={`Delete ${orderType.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <AlertDialog
        open={orderTypeToDelete !== null}
        onOpenChange={(open) => !open && setOrderTypeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{orderTypeToDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the order type and its {orderTypeToDelete?.customer_form_fields.length ?? 0}{' '}
              checkout field(s) for good. Customers will no longer be able to order this way. Past
              orders are not affected.
              <span className="mt-2 block">
                To take it off the storefront temporarily, switch it to Hidden instead.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete order type'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
