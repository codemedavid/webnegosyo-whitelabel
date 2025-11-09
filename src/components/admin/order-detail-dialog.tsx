'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistance } from 'date-fns'
import { 
  Package, 
  UtensilsCrossed, 
  Truck, 
  CreditCard, 
  QrCode, 
  User, 
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

  const orderTypeConfig = getOrderTypeConfig(order.order_type)
  const currentStatus = statusConfig[order.status]
  const StatusIcon = currentStatus.icon
  const currentPaymentStatus = order.payment_status ? paymentStatusConfig[order.payment_status as keyof typeof paymentStatusConfig] : paymentStatusConfig.pending
  const PaymentIcon = currentPaymentStatus.icon

  const itemsCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
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
                    <span className="text-muted-foreground">•</span>
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
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold mb-4">Order Items</h3>
                    {order.order_items.map((item, index) => (
                      <div 
                        key={index} 
                        className="flex justify-between items-start gap-4 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-base">{item.menu_item_name}</h4>
                            <Badge variant="secondary" className="ml-2">
                              Qty: {item.quantity}
                            </Badge>
                          </div>
                          
                          {item.variation && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Package className="h-3.5 w-3.5" />
                              <span className="font-medium">Size:</span> {item.variation}
                            </div>
                          )}
                          
                          {item.addons.length > 0 && (
                            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="font-medium">Add-ons:</span>
                              <div className="flex flex-wrap gap-1">
                                {item.addons.map((addon, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {addon}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {item.special_instructions && (
                            <div className="flex items-start gap-2 text-sm bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
                              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-medium text-yellow-800 dark:text-yellow-400">Note:</span>{' '}
                                <span className="text-yellow-700 dark:text-yellow-300 italic">
                                  {item.special_instructions}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold">{formatPrice(Number(item.subtotal))}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatPrice(Number(item.price))} each
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
