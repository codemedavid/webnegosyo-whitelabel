'use client'

import { ShoppingCart, Minus, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/shared/empty-state'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import Link from 'next/link'

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  tenantSlug: string
}

export function CartDrawer({ open, onClose, tenantSlug }: CartDrawerProps) {
  const { items, total, updateQuantity, removeItem } = useCart()

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Your Cart ({items.length})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={ShoppingCart}
              title="Your cart is empty"
              description="Add some delicious items to get started"
            />
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-4">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md">
                      <Image
                        src={item.menu_item.image_url}
                        alt={item.menu_item.name}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </div>

                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold line-clamp-1">
                            {item.menu_item.name}
                          </h4>
                          {item.selected_variation && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {item.selected_variation.name}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {item.selected_addons.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Add-ons: {item.selected_addons.map((a) => a.name).join(', ')}
                        </p>
                      )}

                      {item.special_instructions && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          Note: {item.special_instructions}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="font-semibold">
                          {formatPrice(item.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="space-y-4">
              <Separator />
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatPrice(total)}</span>
              </div>

              <SheetFooter className="flex-col gap-2 sm:flex-col">
                <Link href={`/${tenantSlug}/cart`} className="w-full" onClick={onClose}>
                  <Button variant="outline" className="w-full">
                    Review Cart
                  </Button>
                </Link>
                <Link href={`/${tenantSlug}/checkout`} className="w-full" onClick={onClose}>
                  <Button className="w-full">Proceed to Checkout</Button>
                </Link>
              </SheetFooter>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

