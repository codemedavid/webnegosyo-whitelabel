'use client'

import { formatDistance } from 'date-fns'
import { Clock, CheckCircle, XCircle, ShoppingBag, Package, Truck, UtensilsCrossed } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { OrderWithItems } from '@/lib/orders-service'

interface OrderCardProps {
  order: OrderWithItems
  onClick: () => void
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

export function OrderCard({ order, onClick }: OrderCardProps) {
  const StatusIcon = statusIcons[order.status]
  const itemCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
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
}

