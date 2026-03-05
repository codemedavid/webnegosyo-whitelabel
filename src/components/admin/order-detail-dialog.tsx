'use client'

import dynamic from 'next/dynamic'
import { format, formatDistance } from 'date-fns'
import {
  Package,
  UtensilsCrossed,
  Truck,
  User,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  ShoppingBag
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatPrice } from '@/lib/cart-utils'
import { OrderItemsDisplay } from '@/components/admin/order-items-display'
import { OrderStatusManagement } from '@/components/admin/order-status-management'
import type { OrderWithItems } from '@/lib/orders-service'

// Lazy-load LalamoveDeliveryPanel since it's only shown conditionally
const LalamoveDeliveryPanel = dynamic(
  () => import('@/components/admin/lalamove-delivery-panel').then(mod => ({ default: mod.LalamoveDeliveryPanel })),
  { ssr: false }
)

interface OrderDetailDialogProps {
  order: OrderWithItems
  tenantSlug: string
  tenantId: string
  onClose: () => void
}

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

function getOrderTypeConfig(orderType: string | undefined | null) {
  if (!orderType) return null

  const normalized = orderType.toLowerCase().replace(/\s+/g, '_').replace(/_in$/, '_in')

  const configs: Record<string, { icon: typeof UtensilsCrossed; color: string; label: string }> = {
    'dine_in': { icon: UtensilsCrossed, color: 'bg-emerald-100 text-emerald-800 border-emerald-300', label: 'Dine In' },
    'pick_up': { icon: Package, color: 'bg-blue-100 text-blue-800 border-blue-300', label: 'Pick Up' },
    'pickup': { icon: Package, color: 'bg-blue-100 text-blue-800 border-blue-300', label: 'Pick Up' },
    'delivery': { icon: Truck, color: 'bg-orange-100 text-orange-800 border-orange-300', label: 'Delivery' },
  }

  return configs[normalized] || null
}

export function OrderDetailDialog({ order, tenantSlug, tenantId, onClose }: OrderDetailDialogProps) {
  const orderTypeConfig = getOrderTypeConfig(order.order_type)
  const currentStatus = statusConfig[order.status]
  const StatusIcon = currentStatus.icon

  const itemsCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="w-[98vw] max-w-7xl max-h-[95vh] overflow-hidden p-0">
        {/* Header Section */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6 border-b">
          <DialogHeader className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-2xl font-bold">
                    Order #{order.id.slice(0, 8).toUpperCase()}
                  </DialogTitle>
                  <Badge className={currentStatus.color} variant="outline">
                    <StatusIcon className="mr-1.5 h-3.5 w-3.5" />
                    {currentStatus.label}
                  </Badge>
                </div>
                <DialogDescription className="flex items-center gap-4 text-base">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {formatDistance(new Date(order.created_at), new Date(), { addSuffix: true })}
                  </span>
                  <span className="text-muted-foreground">&bull;</span>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(order.created_at), 'PPp')}
                  </span>
                </DialogDescription>
              </div>

              {/* Order Type Badge */}
              {orderTypeConfig && (
                <Badge className={`${orderTypeConfig.color} px-3 py-1.5 text-sm`} variant="outline">
                  {(() => {
                    const Icon = orderTypeConfig.icon
                    return (
                      <>
                        <Icon className="mr-1.5 h-4 w-4" />
                        {orderTypeConfig.label}
                      </>
                    )
                  })()}
                </Badge>
              )}
            </div>

            {/* Quick Stats */}
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2 text-sm bg-white/50 dark:bg-slate-800/50 px-3 py-1.5 rounded-md">
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{itemsCount}</span>
                <span className="text-muted-foreground">items</span>
              </div>
              <div className="flex items-center gap-2 text-sm bg-white/50 dark:bg-slate-800/50 px-3 py-1.5 rounded-md">
                <span className="font-semibold text-lg">{formatPrice(Number(order.total))}</span>
              </div>
              {order.delivery_fee && Number(order.delivery_fee) > 0 && (
                <div className="flex items-center gap-2 text-sm bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-md">
                  <Truck className="h-4 w-4 text-orange-600" />
                  <span className="text-orange-800 dark:text-orange-400">
                    +{formatPrice(Number(order.delivery_fee))} delivery
                  </span>
                </div>
              )}
            </div>
          </DialogHeader>
        </div>

        {/* Content Section */}
        <div className="overflow-y-auto max-h-[calc(95vh-180px)]">
          <Tabs defaultValue="details" className="w-full">
            <div className="px-6 pt-4 border-b">
              <TabsList className="grid w-full max-w-2xl grid-cols-4 mb-4">
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Details</span>
                </TabsTrigger>
                <TabsTrigger value="items" className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span className="hidden sm:inline">Items</span>
                </TabsTrigger>
                <TabsTrigger value="customer" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Customer</span>
                </TabsTrigger>
                {(order.lalamove_quotation_id || order.delivery_fee) && (
                  <TabsTrigger value="delivery" className="flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    <span className="hidden sm:inline">Delivery</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="p-6">
              {/* Details Tab */}
              <TabsContent value="details" className="mt-0 space-y-6">
                <OrderStatusManagement
                  order={order}
                  tenantId={tenantId}
                  tenantSlug={tenantSlug}
                  onClose={onClose}
                />

                {/* Order Summary */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Order Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal ({itemsCount} items)</span>
                      <span className="font-medium">
                        {formatPrice(Number(order.total) - (Number(order.delivery_fee) || 0))}
                      </span>
                    </div>
                    {order.delivery_fee && Number(order.delivery_fee) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Delivery Fee</span>
                        <span className="font-medium">{formatPrice(Number(order.delivery_fee))}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span>{formatPrice(Number(order.total))}</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Items Tab */}
              <TabsContent value="items" className="mt-0">
                <OrderItemsDisplay orderItems={order.order_items} />
              </TabsContent>

              {/* Customer Tab */}
              <TabsContent value="customer" className="mt-0">
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold mb-4">Customer Information</h3>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                      {order.customer_name && (
                        <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                          <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Name</div>
                            <div className="font-medium">{order.customer_name}</div>
                          </div>
                        </div>
                      )}

                      {order.customer_contact && (
                        <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                          <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Contact</div>
                            <a
                              href={`tel:${order.customer_contact}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {order.customer_contact}
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional Info */}
                    {order.customer_data && Object.keys(order.customer_data).length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm text-muted-foreground">Additional Information</h4>
                        <div className="space-y-3">
                          {Object.entries(order.customer_data).map(([key, value]) => {
                            const isAddress = key.toLowerCase().includes('address')
                            return (
                              <div
                                key={key}
                                className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg"
                              >
                                {isAddress && <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />}
                                <div className="flex-1">
                                  <div className="text-sm text-muted-foreground capitalize mb-1">
                                    {key.replace(/_/g, ' ')}
                                  </div>
                                  <div className="font-medium break-words">{String(value)}</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Delivery Tab */}
              {(order.lalamove_quotation_id || order.delivery_fee) && (
                <TabsContent value="delivery" className="mt-0">
                  <LalamoveDeliveryPanel order={order} tenantId={tenantId} />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
