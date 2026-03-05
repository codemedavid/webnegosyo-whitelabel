'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  CreditCard,
  QrCode,
  AlertCircle,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateOrderStatusAction, updatePaymentStatusAction } from '@/app/actions/orders'
import { toast } from 'sonner'
import type { OrderWithItems } from '@/lib/orders-service'

const statusConfig = {
  pending: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400',
    icon: Clock,
    label: 'Pending'
  },
  confirmed: {
    color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400',
    icon: CheckCircle2,
    label: 'Confirmed'
  },
  preparing: {
    color: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/20 dark:text-purple-400',
    icon: ShoppingBag,
    label: 'Preparing'
  },
  ready: {
    color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400',
    icon: CheckCircle2,
    label: 'Ready'
  },
  delivered: {
    color: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/20 dark:text-gray-400',
    icon: CheckCircle2,
    label: 'Delivered'
  },
  cancelled: {
    color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400',
    icon: XCircle,
    label: 'Cancelled'
  },
}

const paymentStatusConfig = {
  pending: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    icon: AlertCircle,
    label: 'Pending Payment'
  },
  paid: {
    color: 'bg-green-100 text-green-800 border-green-300',
    icon: CheckCircle2,
    label: 'Paid'
  },
  failed: {
    color: 'bg-red-100 text-red-800 border-red-300',
    icon: XCircle,
    label: 'Payment Failed'
  },
  verified: {
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: CheckCircle2,
    label: 'Verified'
  },
}

interface OrderStatusManagementProps {
  order: OrderWithItems
  tenantId: string
  tenantSlug: string
  onClose: () => void
}

export function OrderStatusManagement({ order, tenantId, tenantSlug, onClose }: OrderStatusManagementProps) {
  const router = useRouter()
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState(false)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)

  const handleStatusUpdate = async (newStatus: string) => {
    setUpdatingStatus(true)

    const result = await updateOrderStatusAction(
      order.id,
      tenantId,
      tenantSlug,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newStatus as any
    )

    if (result.success) {
      toast.success('Order status updated')
      router.refresh()
      onClose()
    } else {
      toast.error(result.error || 'Failed to update status')
    }

    setUpdatingStatus(false)
  }

  const handlePaymentStatusChange = async (newStatus: string) => {
    setUpdatingPaymentStatus(true)

    const result = await updatePaymentStatusAction(
      order.id,
      tenantId,
      tenantSlug,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newStatus as any
    )

    if (result.success) {
      toast.success('Payment status updated')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update payment status')
    }

    setUpdatingPaymentStatus(false)
  }

  const currentStatus = statusConfig[order.status]
  const currentPaymentStatus = order.payment_status ? paymentStatusConfig[order.payment_status as keyof typeof paymentStatusConfig] : paymentStatusConfig.pending
  const PaymentIcon = currentPaymentStatus.icon

  return (
    <>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Order Status Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Order Status
            </h3>
            <div className="space-y-3">
              <Select
                value={order.status}
                onValueChange={handleStatusUpdate}
                disabled={updatingStatus}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      Pending
                    </div>
                  </SelectItem>
                  <SelectItem value="confirmed">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      Confirmed
                    </div>
                  </SelectItem>
                  <SelectItem value="preparing">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-purple-600" />
                      Preparing
                    </div>
                  </SelectItem>
                  <SelectItem value="ready">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Ready
                    </div>
                  </SelectItem>
                  <SelectItem value="delivered">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-gray-600" />
                      Delivered
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      Cancelled
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Current status: <span className="font-medium">{currentStatus.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Section */}
        {order.payment_method_name && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment
            </h3>
            <div className="space-y-4 bg-muted/50 p-4 rounded-lg">
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Method</span>
                <span className="font-medium">{order.payment_method_name}</span>
              </div>

              {order.payment_method_details && (
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Details</span>
                  <div className="bg-background p-3 rounded-md text-sm">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {order.payment_method_details}
                    </pre>
                  </div>
                </div>
              )}

              {order.payment_method_qr_code_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQrDialogOpen(true)}
                  className="w-full"
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  View QR Code
                </Button>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className={currentPaymentStatus.color} variant="outline">
                    <PaymentIcon className="mr-1 h-3 w-3" />
                    {currentPaymentStatus.label}
                  </Badge>
                </div>
                <Select
                  value={order.payment_status || 'pending'}
                  onValueChange={handlePaymentStatusChange}
                  disabled={updatingPaymentStatus}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* QR Code Dialog */}
      {qrDialogOpen && order.payment_method_qr_code_url && (
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Payment QR Code
              </DialogTitle>
              <DialogDescription>
                Scan this QR code for payment
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.payment_method_qr_code_url}
                alt="Payment QR Code"
                className="w-full max-w-sm h-auto object-contain border-2 rounded-lg shadow-lg"
              />
              <p className="text-sm text-muted-foreground text-center">
                Present this QR code to the customer for payment
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
