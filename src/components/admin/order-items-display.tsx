'use client'

import { Package, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import { addonPriceLabel } from '@/lib/addon-quantity'
import { describeOrderItem, type OrderItemChoice } from '@/lib/order-item-display'
import type { OrderWithItems } from '@/lib/orders-service'

type StoredOrderItem = OrderWithItems['order_items'][number]

interface OrderItemsDisplayProps {
  orderItems: OrderWithItems['order_items']
}

function choiceText(choice: OrderItemChoice): string {
  return choice.price ? `${choice.label} (+${formatPrice(choice.price)})` : choice.label
}

/** One line as the kitchen and the cashier need it: what was chosen and what each part cost. */
function OrderItemRow({ item }: { item: StoredOrderItem }) {
  // Web and POS lines store options differently; see describeOrderItem.
  const view = describeOrderItem(item)

  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-wn-ink">
          <span className="mr-1.5 tabular-nums text-wn-stone">{item.quantity}×</span>
          {item.menu_item_name}
        </p>

        {view.choices.length > 0 && (
          <p className="flex items-start gap-1.5 text-[13px] text-wn-stone">
            <Package className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{view.choices.map(choiceText).join(' · ')}</span>
          </p>
        )}

        {view.addons.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[13px] text-wn-stone">
            <span className="font-medium">Add-ons:</span>
            {view.addons.map((addon, i) => (
              <Badge key={i} variant="outline" className="text-xs font-medium">
                {addonPriceLabel(addon, formatPrice)}
              </Badge>
            ))}
          </div>
        )}

        {item.special_instructions && (
          <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[13px] ring-1 ring-amber-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0 wrap-anywhere text-amber-900">
              <span className="font-semibold">Note:</span> <span>{item.special_instructions}</span>
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="font-bold text-wn-ink">{formatPrice(Number(item.subtotal))}</div>
        {item.quantity > 1 && <div className="text-xs text-wn-stone">{formatPrice(view.unitPrice)} each</div>}
      </div>
    </li>
  )
}

export function OrderItemsDisplay({ orderItems }: OrderItemsDisplayProps) {
  return (
    <ul className="divide-y divide-wn-line rounded-2xl bg-white ring-1 ring-border">
      {orderItems.map((item, index) => (
        <OrderItemRow key={item.id ?? index} item={item} />
      ))}
    </ul>
  )
}
