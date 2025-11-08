'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, RefreshCw, X, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/cart-utils'
import { 
  cancelLalamoveOrderAction, 
  syncLalamoveOrderAction,
  createLalamoveOrderAction 
} from '@/app/actions/lalamove'
import { toast } from 'sonner'
import type { OrderWithItems } from '@/lib/orders-service'

interface LalamoveDeliveryPanelProps {
  order: OrderWithItems
  tenantId: string
}

export function LalamoveDeliveryPanel({ order, tenantId }: LalamoveDeliveryPanelProps) {
  const router = useRouter()
  const [cancellingLalamove, setCancellingLalamove] = useState(false)
  const [syncingLalamove, setSyncingLalamove] = useState(false)
  const [creatingLalamove, setCreatingLalamove] = useState(false)

  const handleCancelLalamove = async () => {
    if (!order.lalamove_order_id || !confirm('Are you sure you want to cancel this Lalamove delivery?')) {
      return
    }

    setCancellingLalamove(true)

    const result = await cancelLalamoveOrderAction(tenantId, order.id, order.lalamove_order_id)

    if (result.success) {
      toast.success('Lalamove delivery cancelled')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to cancel Lalamove delivery')
    }

    setCancellingLalamove(false)
  }

  const handleSyncLalamove = async () => {
    if (!order.lalamove_order_id) return

    setSyncingLalamove(true)

    const result = await syncLalamoveOrderAction(tenantId, order.id, order.lalamove_order_id)

    if (result.success) {
      toast.success('Lalamove order synced')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to sync Lalamove order')
    }

    setSyncingLalamove(false)
  }

  const handleCreateLalamoveOrder = async () => {
    if (!order.lalamove_quotation_id) {
      toast.error('No quotation ID found')
      return
    }

    if (order.lalamove_order_id && String(order.lalamove_order_id).trim() !== '') {
      toast.error('Lalamove order already exists')
      return
    }

    setCreatingLalamove(true)

    const customerName = order.customer_name || 'Customer'
    const customerContact = order.customer_contact || ''
    
    if (!customerContact) {
      toast.error('Customer contact information is required')
      setCreatingLalamove(false)
      return
    }

    const tenantName = 'Restaurant'

    const result = await createLalamoveOrderAction(
      tenantId,
      order.id,
      order.lalamove_quotation_id,
      tenantName,
      customerContact,
      customerName,
      customerContact,
      { orderId: order.id, tenantId }
    )

    if (result.success) {
      toast.success('Lalamove order created successfully!')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to create Lalamove order')
    }

    setCreatingLalamove(false)
  }

  if (!order.lalamove_quotation_id && !order.delivery_fee && !order.lalamove_order_id) {
    return null
  }

  return (
    <div className="md:col-span-1 lg:col-span-1">
      <div className="rounded-lg border p-3 sm:p-4 bg-blue-50 border-blue-200 lg:sticky lg:top-0">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          <h3 className="font-semibold text-sm sm:text-base text-blue-900">Lalamove Delivery</h3>
        </div>
        <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
          {order.delivery_fee && Number(order.delivery_fee) > 0 && (
            <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
              <span className="text-muted-foreground text-xs">Delivery Fee:</span>
              <span className="font-medium text-right text-xs sm:text-sm">{formatPrice(Number(order.delivery_fee))}</span>
            </div>
          )}
          {order.lalamove_quotation_id && (
            <div className="grid grid-cols-2 gap-1 sm:gap-2">
              <span className="text-muted-foreground text-xs">Quotation ID:</span>
              <span className="font-mono text-[10px] sm:text-xs text-right break-all">{order.lalamove_quotation_id}</span>
            </div>
          )}
          {order.lalamove_order_id && String(order.lalamove_order_id).trim() !== '' ? (
            <>
              <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                <span className="text-muted-foreground text-xs">Order ID:</span>
                <span className="font-mono text-[10px] sm:text-xs bg-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border text-right break-all">{order.lalamove_order_id}</span>
              </div>
              {order.lalamove_status && (
                <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                  <span className="text-muted-foreground text-xs">Status:</span>
                  <div className="text-right">
                    <Badge 
                      variant="outline"
                      className={`text-[10px] sm:text-xs ${
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
                      {order.lalamove_status}
                    </Badge>
                  </div>
                </div>
              )}
              {order.lalamove_driver_name ? (
                <>
                  <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center pt-1">
                    <span className="text-muted-foreground font-medium text-xs">Driver:</span>
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 w-fit ml-auto text-[10px] sm:text-xs">
                      ✓ Found
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 sm:gap-2">
                    <span className="text-muted-foreground text-xs">Name:</span>
                    <span className="font-medium text-right text-xs sm:text-sm break-words">{order.lalamove_driver_name}</span>
                  </div>
                </>
              ) : order.lalamove_status === 'ASSIGNING' || order.lalamove_status === 'ASSIGNING_DRIVER' ? (
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
              {order.lalamove_driver_phone && (
                <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
                  <span className="text-muted-foreground text-xs">Phone:</span>
                  <a 
                    href={`tel:${order.lalamove_driver_phone}`}
                    className="text-blue-600 hover:underline text-right text-[10px] sm:text-xs break-all"
                  >
                    {order.lalamove_driver_phone}
                  </a>
                </div>
              )}
              {order.lalamove_tracking_url && (
                <div className="pt-1 sm:pt-2">
                  <a
                    href={order.lalamove_tracking_url}
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
                  onClick={handleSyncLalamove}
                  disabled={syncingLalamove}
                  className="w-full text-xs sm:text-sm h-8 sm:h-9"
                >
                  {syncingLalamove ? (
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
                {order.lalamove_status !== 'CANCELLED' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCancelLalamove}
                    disabled={cancellingLalamove}
                    className="w-full text-xs sm:text-sm h-8 sm:h-9"
                  >
                    {cancellingLalamove ? (
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
                onClick={handleCreateLalamoveOrder}
                disabled={creatingLalamove || !order.customer_contact}
                className="w-full bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-8 sm:h-9"
              >
                {creatingLalamove ? (
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
              {!order.customer_contact && (
                <p className="text-[10px] sm:text-xs text-red-600">Customer contact information is required</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


