'use client'

import { useState } from 'react'
import { formatDistance } from 'date-fns'
import { 
  ShoppingBag, 
  Clock, 
  CheckCircle, 
  XCircle, 
  UtensilsCrossed, 
  Package, 
  Truck
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
import { formatPrice } from '@/lib/cart-utils'
import { OrderDetailDialog } from '@/components/admin/order-detail-dialog'
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
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all')

  // Extract unique order types from orders
  const orderTypes = Array.from(new Set(orders.map(o => o.order_type).filter(Boolean))) as string[]

  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    const matchesType = orderTypeFilter === 'all' || order.order_type === orderTypeFilter
    return matchesStatus && matchesType
  })

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

      {selectedOrder && (
        <OrderDetailDialog
          order={selectedOrder}
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </>
  )
}

