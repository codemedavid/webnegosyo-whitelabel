'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItemWithCategory } from '@/types/database'

interface UncoveredItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  menuItems: MenuItemWithCategory[]
  uncoveredItemIds: string[]
}

export function UncoveredItemsDialog({
  open,
  onOpenChange,
  menuItems,
  uncoveredItemIds,
}: UncoveredItemsDialogProps) {
  const [search, setSearch] = useState('')

  const uncoveredItems = useMemo(() => {
    const idSet = new Set(uncoveredItemIds)
    let items = menuItems.filter((i) => idSet.has(i.id))
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category?.name.toLowerCase().includes(q)
      )
    }
    return items
  }, [menuItems, uncoveredItemIds, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Uncovered Items</DialogTitle>
          <DialogDescription>
            {uncoveredItemIds.length} menu items are not in any upsell, bundle, or checkout pick.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {uncoveredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {search ? 'No items match your search.' : 'All items are covered!'}
            </p>
          ) : (
            <ul className="divide-y">
              {uncoveredItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.category?.name && (
                      <p className="text-xs text-muted-foreground">{item.category.name}</p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatPrice(item.price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
