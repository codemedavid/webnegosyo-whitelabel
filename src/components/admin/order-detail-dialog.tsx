'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistance } from 'date-fns'
import { Package, UtensilsCrossed, Truck, CreditCard, QrCode } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/cart-utils'
import { updateOrderStatusAction, updatePaymentStatusAction } from '@/app/actions/orders'
import { LalamoveDeliveryPanel } from '@/components/admin/lalamove-delivery-panel'
import { toast } from 'sonner'
import type { OrderWithItems } from '@/lib/orders-service'

interface OrderDetailDialogProps {
  order: OrderWithItems
  tenantSlug: string
  tenantId: string
  onClose: () => void
}

const paymentStatusColors = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  paid: 'bg-green-100 text-green-800 border-green-300',
  failed: 'bg-red-100 text-red-800 border-red-300',
  verified: 'bg-blue-100 text-blue-800 border-blue-300',
}

function getOrderTypeConfig(orderType: string | undefined | null) {
  if (!orderType) return null
  
  const normalized = orderType.toLowerCase().replace(/\s+/g, '_').replace(/_in$/, '_in')
  
  const configs: Record<string, { icon: typeof UtensilsCrossed; color: string; label: string }> = {
    'dine_in': { icon: UtensilsCrossed, color: 'bg-green-100 text-green-800 border-green-300', label: 'Dine In' },
    'pick_up': { icon: Package, color: 'bg-blue-100 text-blue-800 border-blue-300', label: 'Pick Up' },
    'pickup': { icon: Package, color: 'bg-blue-100 text-blue-800 border-blue-300', label: 'Pick Up' },
    'delivery': { icon: Truck, color: 'bg-orange-100 text-orange-800 border-orange-300', label: 'Delivery' },
  }
  
  return configs[normalized] || null
}

export function OrderDetailDialog({ order, tenantSlug, tenantId, onClose }: OrderDetailDialogProps) {
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

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl">Order Details</DialogTitle>
            <DialogDescription className="text-sm">
              Order #{order.id.slice(0, 8)} • {formatDistance(new Date(order.created_at), new Date(), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Left Column - Main Order Info */}
            <div className="md:col-span-1 lg:col-span-2 space-y-4 sm:space-y-6">
              <div>
                <h3 className="font-semibold mb-2 text-sm sm:text-base">Customer Information</h3>
                <div className="space-y-1 text-xs sm:text-sm">
                  {order.customer_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span>{order.customer_name}</span>
                    </div>
                  )}
                  {order.customer_contact && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contact:</span>
                      <span>{order.customer_contact}</span>
                    </div>
                  )}
                  {order.order_type && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Order Type:</span>
                      {(() => {
                        const config = getOrderTypeConfig(order.order_type)
                        const Icon = config?.icon || Package
                        return config ? (
                          <Badge className={config.color} variant="outline">
                            <Icon className="mr-1 h-3 w-3" />
                            {config.label}
                          </Badge>
                        ) : (
                          <span>{order.order_type}</span>
                        )
                      })()}
                    </div>
                  )}
                  {order.customer_data && Object.keys(order.customer_data).length > 0 && (
                    <div className="mt-3">
                      <h4 className="font-medium mb-2">Additional Information:</h4>
                      {Object.entries(order.customer_data).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground capitalize">{key.replace('_', ' ')}:</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method Information */}
              {order.payment_method_name && (
                <div>
                  <h3 className="font-semibold mb-2 text-sm sm:text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Payment Method
                  </h3>
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between items-start">
                      <span className="text-muted-foreground">Method:</span>
                      <span className="font-medium">{order.payment_method_name}</span>
                    </div>
                    {order.payment_method_details && (
                      <div className="bg-muted p-2 rounded">
                        <p className="text-xs whitespace-pre-wrap">{order.payment_method_details}</p>
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
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-2 text-sm sm:text-base">Order Items</h3>
                <div className="space-y-2">
                  {order.order_items.map((item, index) => (
                    <div key={index} className="flex justify-between items-start p-2 sm:p-3 bg-muted rounded-lg gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs sm:text-sm truncate">{item.menu_item_name}</p>
                        {item.variation && (
                          <p className="text-xs sm:text-sm text-muted-foreground">Size: {item.variation}</p>
                        )}
                        {item.addons.length > 0 && (
                          <p className="text-xs sm:text-sm text-muted-foreground break-words">
                            Add-ons: {item.addons.join(', ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="text-xs sm:text-sm text-muted-foreground italic break-words">
                            Note: {item.special_instructions}
                          </p>
                        )}
                        <p className="text-xs sm:text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold text-xs sm:text-sm flex-shrink-0">{formatPrice(Number(item.subtotal))}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 sm:pt-4 border-t">
                <span className="text-base sm:text-lg font-semibold">Total</span>
                <span className="text-xl sm:text-2xl font-bold">{formatPrice(Number(order.total))}</span>
              </div>

              <div>
                <h3 className="font-semibold mb-2 text-sm sm:text-base">Update Status</h3>
                <Select
                  value={order.status}
                  onValueChange={handleStatusUpdate}
                  disabled={updatingStatus}
                >
                  <SelectTrigger className="h-9 sm:h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="preparing">Preparing</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Status */}
              {order.payment_method_name && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs sm:text-sm font-medium">Payment Status</label>
                  <Select
                    value={order.payment_status || 'pending'}
                    onValueChange={handlePaymentStatusChange}
                    disabled={updatingPaymentStatus}
                  >
                    <SelectTrigger className="h-9 sm:h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge 
                    className={paymentStatusColors[order.payment_status as keyof typeof paymentStatusColors] || paymentStatusColors.pending}
                    variant="outline"
                  >
                    {order.payment_status?.toUpperCase() || 'PENDING'}
                  </Badge>
                </div>
              )}
            </div>

            {/* Right Column - Lalamove Delivery */}
            <LalamoveDeliveryPanel order={order} tenantId={tenantId} />
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      {qrDialogOpen && order.payment_method_qr_code_url && (
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Payment QR Code</DialogTitle>
              <DialogDescription>
                Scan this QR code for payment
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.payment_method_qr_code_url}
                alt="Payment QR Code"
                className="w-full max-w-sm h-auto object-contain border rounded-lg"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

