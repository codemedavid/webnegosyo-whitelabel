'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistance } from 'date-fns'
import { ShoppingBag, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPrice } from '@/lib/cart-utils'
import { updateOrderStatusAction } from '@/app/actions/orders'
import { toast } from 'sonner'
import type { OrderWithItems } from '@/lib/orders-service'

interface OrdersListProps {
  orders: OrderWithItems[]
  tenantSlug: string
  tenantId: string
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-300',
  preparing: 'bg-orange-100 text-orange-800 border-orange-300',
  ready: 'bg-green-100 text-green-800 border-green-300',
  delivered: 'bg-gray-100 text-gray-800 border-gray-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
}

const statusIcons = {
  pending: Clock,
  confirmed: CheckCircle,
  preparing: ShoppingBag,
  ready: CheckCircle,
  delivered: CheckCircle,
  cancelled: XCircle,
}

export function OrdersList({ orders, tenantSlug, tenantId }: OrdersListProps) {
  const router = useRouter()
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const filteredOrders = orders.filter((order) => 
    statusFilter === 'all' || order.status === statusFilter
  )

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingStatus(orderId)

    const result = await updateOrderStatusAction(
      orderId,
      tenantId,
      tenantSlug,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newStatus as any
    )

    if (result.success) {
      toast.success('Order status updated')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update status')
    }

    setUpdatingStatus(null)
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
          <p className="text-muted-foreground">Orders from customers will appear here</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="preparing">Preparing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const StatusIcon = statusIcons[order.status]
          const itemCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0)

          return (
            <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOrder(order)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {formatDistance(new Date(order.created_at), new Date(), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge className={statusColors[order.status]} variant="outline">
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {order.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {order.customer_name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Customer:</span>
                      <span className="font-medium">{order.customer_name}</span>
                    </div>
                  )}
                  {order.customer_contact && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Contact:</span>
                      <span className="font-medium">{order.customer_contact}</span>
                    </div>
                  )}
                  {order.order_type && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Order Type:</span>
                      <span className="font-medium">{order.order_type}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Items:</span>
                    <span className="font-medium">{itemCount}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total:</span>
                    <span>{formatPrice(Number(order.total))}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order #{selectedOrder?.id.slice(0, 8)} • {selectedOrder && formatDistance(new Date(selectedOrder.created_at), new Date(), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Customer Information</h3>
                <div className="space-y-1 text-sm">
                  {selectedOrder.customer_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span>{selectedOrder.customer_name}</span>
                    </div>
                  )}
                  {selectedOrder.customer_contact && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contact:</span>
                      <span>{selectedOrder.customer_contact}</span>
                    </div>
                  )}
                  {selectedOrder.order_type && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Order Type:</span>
                      <span>{selectedOrder.order_type}</span>
                    </div>
                  )}
                  {selectedOrder.customer_data && Object.keys(selectedOrder.customer_data).length > 0 && (
                    <div className="mt-3">
                      <h4 className="font-medium mb-2">Additional Information:</h4>
                      {Object.entries(selectedOrder.customer_data).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground capitalize">{key.replace('_', ' ')}:</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Order Items</h3>
                <div className="space-y-2">
                  {selectedOrder.order_items.map((item, index) => (
                    <div key={index} className="flex justify-between items-start p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{item.menu_item_name}</p>
                        {item.variation && (
                          <p className="text-sm text-muted-foreground">Size: {item.variation}</p>
                        )}
                        {item.addons.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add-ons: {item.addons.join(', ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="text-sm text-muted-foreground italic">
                            Note: {item.special_instructions}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold">{formatPrice(Number(item.subtotal))}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-lg font-semibold">Total</span>
                <span className="text-2xl font-bold">{formatPrice(Number(selectedOrder.total))}</span>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Update Status</h3>
                <Select
                  value={selectedOrder.status}
                  onValueChange={(value) => handleStatusUpdate(selectedOrder.id, value)}
                  disabled={updatingStatus === selectedOrder.id}
                >
                  <SelectTrigger>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

