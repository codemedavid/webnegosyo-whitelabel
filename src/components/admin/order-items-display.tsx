'use client'

import { Package, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { OrderWithItems } from '@/lib/orders-service'

interface OrderItemsDisplayProps {
  orderItems: OrderWithItems['order_items']
}

export function OrderItemsDisplay({ orderItems }: OrderItemsDisplayProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold mb-4">Order Items</h3>
      {orderItems.map((item, index) => (
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
  )
}
