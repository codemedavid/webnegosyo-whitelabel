'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { ORDER_EVENT_REASON_MAX } from '@/lib/staff-activity/order-event-reason'
import { formatDailyOrderNumber } from '@/lib/order-number'
import { updateOrderStatusAction, updatePaymentStatusAction } from '@/app/actions/orders'
import { ORDER_STATUSES, STATUS_META, type OrderStatus } from '@/lib/admin/orders-table/status'
import type { OrderWithItems } from '@/lib/orders-service'

const PAYMENT_STATUS_LABELS = {
  pending: 'Not paid yet',
  paid: 'Paid',
  verified: 'Verified',
  failed: 'Failed',
} as const

type PaymentStatus = keyof typeof PAYMENT_STATUS_LABELS

interface OrderStatusManagementProps {
  order: OrderWithItems
  tenantId: string
  tenantSlug: string
  /**
   * Told the moment a change is stored, so the panel and its table row show it
   * at once instead of snapping back until the page refresh lands.
   */
  onChanged?: (orderId: string, patch: Pick<Partial<OrderWithItems>, 'status' | 'payment_status'>) => void
}

/**
 * Any status (back, forward or cancel) and the payment status, for one order.
 * The forward step also has its own button above this in the order panel.
 *
 * The panel stays open after a change and refreshes in place: the merchant
 * sees the result instead of being sent back to the list.
 */
export function OrderStatusManagement({ order, tenantId, tenantSlug, onChanged }: OrderStatusManagementProps) {
  const router = useRouter()
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState(false)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  // Cancelling has side effects (stock back, the customer told), so it is
  // asked once, with an optional reason for Store Activity.
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const handleStatusUpdate = async (newStatus: string, reason?: string) => {
    setUpdatingStatus(true)
    const result = await updateOrderStatusAction(order.id, tenantId, tenantSlug, newStatus as OrderStatus, reason ? { reason } : {})
    if (result.success) {
      onChanged?.(order.id, { status: newStatus as OrderStatus })
      toast.success(`Order marked ${STATUS_META[newStatus as OrderStatus]?.label.toLowerCase() ?? newStatus}`)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update status')
    }
    setUpdatingStatus(false)
  }

  const handlePaymentStatusChange = async (newStatus: string) => {
    setUpdatingPaymentStatus(true)
    const result = await updatePaymentStatusAction(order.id, tenantId, tenantSlug, newStatus as PaymentStatus)
    if (result.success) {
      onChanged?.(order.id, { payment_status: newStatus as PaymentStatus })
      toast.success('Payment status updated')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update payment status')
    }
    setUpdatingPaymentStatus(false)
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-wn-stone">Order status</span>
          <Select
            value={order.status}
            onValueChange={(next) => {
              if (next === 'cancelled') {
                setCancelReason('')
                setIsConfirmingCancel(true)
                return
              }
              void handleStatusUpdate(next)
            }}
            disabled={updatingStatus}
          >
            <SelectTrigger aria-label="Order status" className="h-10 w-full rounded-xl bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_META[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {order.payment_method_name && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-wn-stone">Payment</span>
            <Select value={order.payment_status || 'pending'} onValueChange={handlePaymentStatusChange} disabled={updatingPaymentStatus}>
              <SelectTrigger aria-label="Payment status" className="h-10 w-full rounded-xl bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((status) => (
                  <SelectItem key={status} value={status}>
                    {PAYMENT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>

      {order.payment_method_name && (
        <div className="mt-4 space-y-2 rounded-xl bg-wn-sand p-3 text-[14px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-wn-stone">Method</span>
            <span className="font-semibold text-wn-ink">{order.payment_method_name}</span>
          </div>
          {order.payment_method_details && (
            <pre className="rounded-lg bg-white p-2 font-mono text-xs whitespace-pre-wrap text-wn-ink ring-1 ring-wn-line">
              {order.payment_method_details}
            </pre>
          )}
          {order.payment_method_qr_code_url && (
            <button
              type="button"
              onClick={() => setQrDialogOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-[13.5px] font-semibold text-wn-ink ring-1 ring-wn-line outline-none hover:bg-wn-canvas focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              <QrCode aria-hidden className="size-4" />
              View QR code
            </button>
          )}
        </div>
      )}

      <AlertDialog open={isConfirmingCancel} onOpenChange={setIsConfirmingCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {formatDailyOrderNumber(order.daily_number ?? order.daily_order_number, order.id)}?</AlertDialogTitle>
            <AlertDialogDescription>The order moves to Cancelled. You can set it back from this menu later.</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-wn-stone">Reason (optional)</span>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={ORDER_EVENT_REASON_MAX}
              rows={2}
              placeholder="e.g. Customer asked to cancel"
              className="rounded-xl bg-white px-3 py-2 text-[14px] text-wn-ink ring-1 ring-wn-line outline-none focus-visible:ring-2 focus-visible:ring-wn-ink"
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleStatusUpdate('cancelled', cancelReason.trim() || undefined)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {qrDialogOpen && order.payment_method_qr_code_url && (
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Payment QR code
              </DialogTitle>
              <DialogDescription>Show this to the customer to pay</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.payment_method_qr_code_url}
                alt="Payment QR code"
                className="h-auto w-full max-w-sm rounded-lg border-2 object-contain shadow-lg"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
