'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistance } from 'date-fns'
import { 
  ShoppingBag, 
  Clock, 
  CheckCircle, 
  XCircle, 
  UtensilsCrossed, 
  Package, 
  Truck, 
  RefreshCw, 
  X, 
  ExternalLink 
} from 'lucide-react'
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
import { 
  cancelLalamoveOrderAction, 
  syncLalamoveOrderAction,
  createLalamoveOrderAction 
} from '@/app/actions/lalamove'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { OrderWithItems } from '@/lib/orders-service'

interface OrdersListProps {
  orders: OrderWithItems[]
  tenantSlug: string
  tenantId: string
  pagination?: {
    currentPage: number
    totalPages: number
    totalCount: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
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

// Helper to get order type config from order_type string (can be "Dine In", "Pick Up", "Delivery" or "dine_in", "pickup", "delivery")
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

export function OrdersList({ orders, tenantSlug, tenantId }: OrdersListProps) {
  const router = useRouter()
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [cancellingLalamove, setCancellingLalamove] = useState<string | null>(null)
  const [syncingLalamove, setSyncingLalamove] = useState<string | null>(null)
  const [creatingLalamove, setCreatingLalamove] = useState<string | null>(null)

  // Extract unique order types from orders
  const orderTypes = Array.from(new Set(orders.map(o => o.order_type).filter(Boolean))) as string[]

  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    const matchesType = orderTypeFilter === 'all' || order.order_type === orderTypeFilter
    return matchesStatus && matchesType
  })

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

  const handleCancelLalamove = async (orderId: string, lalamoveOrderId: string) => {
    if (!confirm('Are you sure you want to cancel this Lalamove delivery?')) {
      return
    }

    setCancellingLalamove(orderId)

    const result = await cancelLalamoveOrderAction(tenantId, orderId, lalamoveOrderId)

    if (result.success) {
      toast.success('Lalamove delivery cancelled')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to cancel Lalamove delivery')
    }

    setCancellingLalamove(null)
  }

  const handleSyncLalamove = async (orderId: string, lalamoveOrderId: string) => {
    setSyncingLalamove(orderId)

    const result = await syncLalamoveOrderAction(tenantId, orderId, lalamoveOrderId)

    if (result.success) {
      toast.success('Lalamove order synced')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to sync Lalamove order')
    }

    setSyncingLalamove(null)
  }

  const handleCreateLalamoveOrder = async (order: OrderWithItems) => {
    if (!order.lalamove_quotation_id) {
      toast.error('No quotation ID found')
      return
    }

    // Check if order already exists
    if (order.lalamove_order_id && String(order.lalamove_order_id).trim() !== '') {
      toast.error('Lalamove order already exists')
      return
    }

    setCreatingLalamove(order.id)

    // Get customer info
    const customerName = order.customer_name || 'Customer'
    const customerContact = order.customer_contact || ''
    
    if (!customerContact) {
      toast.error('Customer contact information is required')
      setCreatingLalamove(null)
      return
    }

    // Get tenant name (simplified - you might want to fetch this)
    const tenantName = 'Restaurant' // Will use customer contact as sender phone

    const result = await createLalamoveOrderAction(
      tenantId,
      order.id,
      order.lalamove_quotation_id,
      tenantName,
      customerContact, // Sender phone
      customerName,
      customerContact, // Recipient phone
      { orderId: order.id, tenantId }
    )

    if (result.success) {
      toast.success('Lalamove order created successfully!')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to create Lalamove order')
    }

    setCreatingLalamove(null)
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
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="preparing">Preparing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {orderTypes.length > 0 && (
          <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {orderTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
                    <div className="flex justify-between items-center text-sm">
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
                          <span className="font-medium">{order.order_type}</span>
                        )
                      })()}
                    </div>
                  )}
                  {order.delivery_fee && Number(order.delivery_fee) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery Fee:</span>
                      <span className="font-medium">{formatPrice(Number(order.delivery_fee))}</span>
                    </div>
                  )}
                  {order.lalamove_quotation_id && (
                    <div className="flex items-center gap-2 text-sm">
                      <Truck className="h-4 w-4 text-blue-600" />
                      <span className="text-muted-foreground">Lalamove:</span>
                      {order.lalamove_order_id ? (
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            order.lalamove_status === 'ASSIGNING' || order.lalamove_status === 'ASSIGNED' 
                              ? 'bg-green-100 text-green-800 border-green-300' 
                              : order.lalamove_status === 'PICKED_UP' || order.lalamove_status === 'IN_TRANSIT'
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : order.lalamove_status === 'DELIVERED'
                              ? 'bg-gray-100 text-gray-800 border-gray-300'
                              : order.lalamove_status === 'CANCELLED'
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                          }`}
                        >
                          {order.lalamove_status || 'Pending'}
                          {order.lalamove_driver_name && ' • Driver Found'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-gray-100 text-gray-800 border-gray-300">
                          Order not created yet
                        </Badge>
                      )}
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
        <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl">Order Details</DialogTitle>
            <DialogDescription className="text-sm">
              Order #{selectedOrder?.id.slice(0, 8)} • {selectedOrder && formatDistance(new Date(selectedOrder.created_at), new Date(), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Left Column - Main Order Info */}
              <div className="md:col-span-1 lg:col-span-2 space-y-4 sm:space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">Customer Information</h3>
                  <div className="space-y-1 text-xs sm:text-sm">
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
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Order Type:</span>
                        {(() => {
                          const config = getOrderTypeConfig(selectedOrder.order_type)
                          const Icon = config?.icon || Package
                          return config ? (
                            <Badge className={config.color} variant="outline">
                              <Icon className="mr-1 h-3 w-3" />
                              {config.label}
                            </Badge>
                          ) : (
                            <span>{selectedOrder.order_type}</span>
                          )
                        })()}
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
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">Order Items</h3>
                  <div className="space-y-2">
                    {selectedOrder.order_items.map((item, index) => (
                      <div key={index} className="flex justify-between items-start p-2 sm:p-3 bg-muted rounded-lg gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs sm:text-sm truncate">{item.menu_item_name}</p>
                          {item.variation && (
                            <p className="text-xs sm:text-sm text-muted-foreground break-words">
                              <span className="font-medium">Variations:</span> {item.variation}
                            </p>
                          )}
                          {item.addons.length > 0 && (
                            <p className="text-xs sm:text-sm text-muted-foreground break-words">
                              <span className="font-medium">Add-ons:</span> {item.addons.join(', ')}
                            </p>
                          )}
                          {item.special_instructions && (
                            <p className="text-xs sm:text-sm text-muted-foreground italic break-words">
                              <span className="font-medium">Note:</span> {item.special_instructions}
                            </p>
                          )}
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            <span className="font-medium">Qty:</span> {item.quantity}
                          </p>
                        </div>
                        <p className="font-semibold text-xs sm:text-sm flex-shrink-0">{formatPrice(Number(item.subtotal))}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 sm:pt-4 border-t">
                  <span className="text-base sm:text-lg font-semibold">Total</span>
                  <span className="text-xl sm:text-2xl font-bold">{formatPrice(Number(selectedOrder.total))}</span>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">Update Status</h3>
                  <Select
                    value={selectedOrder.status}
                    onValueChange={(value) => handleStatusUpdate(selectedOrder.id, value)}
                    disabled={updatingStatus === selectedOrder.id}
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
              </div>

              {/* Right Column - Lalamove Delivery */}
              {(selectedOrder.lalamove_quotation_id || (selectedOrder.delivery_fee && Number(selectedOrder.delivery_fee) > 0) || selectedOrder.lalamove_order_id) && (
                <div className="md:col-span-1 lg:col-span-1">
                  <div className="rounded-lg border p-3 sm:p-4 bg-blue-50 border-blue-200 lg:sticky lg:top-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                      <h3 className="font-semibold text-sm sm:text-base text-blue-900">Lalamove Delivery</h3>
                    </div>
                    <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                      {selectedOrder.delivery_fee && Number(selectedOrder.delivery_fee) > 0 && (
                        <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                          <span className="text-muted-foreground text-xs">Delivery Fee:</span>
                          <span className="font-medium text-right text-xs sm:text-sm">{formatPrice(Number(selectedOrder.delivery_fee))}</span>
                        </div>
                      )}
                      {selectedOrder.lalamove_quotation_id && (
                        <div className="grid grid-cols-2 gap-1 sm:gap-2">
                          <span className="text-muted-foreground text-xs">Quotation ID:</span>
                          <span className="font-mono text-[10px] sm:text-xs text-right break-all">{selectedOrder.lalamove_quotation_id}</span>
                        </div>
                      )}
                      {selectedOrder.lalamove_order_id && String(selectedOrder.lalamove_order_id).trim() !== '' ? (
                        <>
                          <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                            <span className="text-muted-foreground text-xs">Order ID:</span>
                            <span className="font-mono text-[10px] sm:text-xs bg-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border text-right break-all">{selectedOrder.lalamove_order_id}</span>
                          </div>
                          {selectedOrder.lalamove_status && (
                            <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                              <span className="text-muted-foreground text-xs">Status:</span>
                              <div className="text-right">
                                <Badge 
                                  variant="outline"
                                  className={`text-[10px] sm:text-xs ${
                                    selectedOrder.lalamove_status === 'ASSIGNING' || selectedOrder.lalamove_status === 'ASSIGNED'
                                      ? 'bg-green-100 text-green-800 border-green-300'
                                      : selectedOrder.lalamove_status === 'PICKED_UP' || selectedOrder.lalamove_status === 'IN_TRANSIT'
                                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                                      : selectedOrder.lalamove_status === 'DELIVERED'
                                      ? 'bg-gray-100 text-gray-800 border-gray-300'
                                      : selectedOrder.lalamove_status === 'CANCELLED'
                                      ? 'bg-red-100 text-red-800 border-red-300'
                                      : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                  }`}
                                >
                                  {selectedOrder.lalamove_status}
                                </Badge>
                              </div>
                            </div>
                          )}
                          {selectedOrder.lalamove_driver_name ? (
                            <>
                              <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center pt-1">
                                <span className="text-muted-foreground font-medium text-xs">Driver:</span>
                                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 w-fit ml-auto text-[10px] sm:text-xs">
                                  ✓ Found
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-1 sm:gap-2">
                                <span className="text-muted-foreground text-xs">Name:</span>
                                <span className="font-medium text-right text-xs sm:text-sm break-words">{selectedOrder.lalamove_driver_name}</span>
                              </div>
                            </>
                          ) : selectedOrder.lalamove_status === 'ASSIGNING' || selectedOrder.lalamove_status === 'ASSIGNING_DRIVER' ? (
                            <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                              <span className="text-muted-foreground text-xs">Driver:</span>
                              <span className="text-[10px] sm:text-xs italic text-orange-600 text-right">Searching...</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                              <span className="text-muted-foreground text-xs">Driver:</span>
                              <span className="text-[10px] sm:text-xs text-gray-500 text-right">Not assigned</span>
                            </div>
                          )}
                          {selectedOrder.lalamove_driver_phone && (
                            <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                              <span className="text-muted-foreground text-xs">Phone:</span>
                              <a 
                                href={`tel:${selectedOrder.lalamove_driver_phone}`}
                                className="text-blue-600 hover:underline text-right text-[10px] sm:text-xs break-all"
                              >
                                {selectedOrder.lalamove_driver_phone}
                              </a>
                            </div>
                          )}
                          {selectedOrder.lalamove_tracking_url && (
                            <div className="pt-1 sm:pt-2">
                              <a
                                href={selectedOrder.lalamove_tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 sm:gap-2 text-blue-600 hover:underline w-full justify-center text-xs sm:text-sm"
                              >
                                <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
                                Track Delivery
                              </a>
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5 sm:gap-2 pt-1 sm:pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSyncLalamove(selectedOrder.id, selectedOrder.lalamove_order_id!)}
                              disabled={syncingLalamove === selectedOrder.id}
                              className="w-full text-xs sm:text-sm h-8 sm:h-9"
                            >
                              {syncingLalamove === selectedOrder.id ? (
                                <>
                                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                                  <span className="hidden sm:inline">Syncing...</span>
                                  <span className="sm:hidden">Sync...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                  <span className="hidden sm:inline">Sync Status</span>
                                  <span className="sm:hidden">Sync</span>
                                </>
                              )}
                            </Button>
                            {selectedOrder.lalamove_status !== 'CANCELLED' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelLalamove(selectedOrder.id, selectedOrder.lalamove_order_id!)}
                                disabled={cancellingLalamove === selectedOrder.id}
                                className="w-full text-xs sm:text-sm h-8 sm:h-9"
                              >
                                {cancellingLalamove === selectedOrder.id ? (
                                  <>
                                    <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-pulse" />
                                    <span className="hidden sm:inline">Cancelling...</span>
                                    <span className="sm:hidden">Cancel...</span>
                                  </>
                                ) : (
                                  <>
                                    <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                    <span className="hidden sm:inline">Cancel Delivery</span>
                                    <span className="sm:hidden">Cancel</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            Lalamove order has not been created yet. You can create it manually or it will be created automatically when the order status is changed to &quot;confirmed&quot;.
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleCreateLalamoveOrder(selectedOrder)}
                            disabled={creatingLalamove === selectedOrder.id || !selectedOrder.customer_contact}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-8 sm:h-9"
                          >
                            {creatingLalamove === selectedOrder.id ? (
                              <>
                                <div className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1 sm:mr-2"></div>
                                <span className="hidden sm:inline">Creating Order...</span>
                                <span className="sm:hidden">Creating...</span>
                              </>
                            ) : (
                              <>
                                <Truck className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                <span className="hidden sm:inline">Create Lalamove Order</span>
                                <span className="sm:hidden">Create Order</span>
                              </>
                            )}
                          </Button>
                          {!selectedOrder.customer_contact && (
                            <p className="text-[10px] sm:text-xs text-red-600">Customer contact information is required</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

