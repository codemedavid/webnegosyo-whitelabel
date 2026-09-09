'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Search, Tags } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  setOrderTypeItemPriceAction,
  clearOrderTypeItemPriceAction,
} from '@/app/actions/order-type-pricing'
import {
  buildOrderTypePriceIndex,
  pricingForOrderType,
  resolveItemPrice,
} from '@/lib/order-types/order-type-pricing'
import type { PricingMenuItem } from '@/lib/order-type-pricing-service'
import type { OrderTypeItemPrice } from '@/types/database'

interface OrderTypePricingPanelProps {
  tenantId: string
  tenantSlug: string
  orderTypeId: string
  /** The markup currently in the form — unsaved edits preview here too. */
  markupPercent: number | null
  menuItems: readonly PricingMenuItem[]
  initialPrices: readonly OrderTypeItemPrice[]
}

const INVALID_PRICE_MESSAGE = 'Enter a price of zero or more'

function formatPeso(amount: number): string {
  return `₱${amount.toFixed(2)}`
}

/** The price the register starts from: the discount when there is one. */
function effectiveStorePrice(item: PricingMenuItem): number {
  return item.discounted_price ?? item.price
}

function parsePrice(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function matchesSearch(item: PricingMenuItem, query: string): boolean {
  if (query === '') return true
  const haystack = `${item.name} ${item.category_name ?? ''}`.toLowerCase()
  return haystack.includes(query)
}

/**
 * Exact per-item prices for one order type, beside the price the markup alone
 * would produce. The "register price" column runs through the same resolver
 * the POS uses, so what the merchant sees here is what the cashier charges.
 */
export function OrderTypePricingPanel({
  tenantId,
  tenantSlug,
  orderTypeId,
  markupPercent,
  menuItems,
  initialPrices,
}: OrderTypePricingPanelProps) {
  const [overrides, setOverrides] = useState<OrderTypeItemPrice[]>([...initialPrices])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const pricing = useMemo(
    () => pricingForOrderType({ id: orderTypeId, markupPercent }, buildOrderTypePriceIndex(overrides)),
    [orderTypeId, markupPercent, overrides]
  )

  const query = search.trim().toLowerCase()
  const visibleItems = menuItems.filter((item) => matchesSearch(item, query))

  const setPrice = (item: PricingMenuItem) => {
    const price = parsePrice(drafts[item.id] ?? '')
    if (price === null) {
      toast.error(INVALID_PRICE_MESSAGE)
      return
    }
    setBusyId(item.id)
    startTransition(async () => {
      const result = await setOrderTypeItemPriceAction(tenantId, tenantSlug, orderTypeId, {
        menu_item_id: item.id,
        price,
      })
      setBusyId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const saved = result.data
      setOverrides((prev) => [...prev.filter((row) => row.menu_item_id !== item.id), saved])
      setDrafts((prev) => ({ ...prev, [item.id]: '' }))
      toast.success(`${item.name} set to ${formatPeso(saved.price)}`)
    })
  }

  const clearPrice = (item: PricingMenuItem) => {
    setBusyId(item.id)
    startTransition(async () => {
      const result = await clearOrderTypeItemPriceAction(tenantId, tenantSlug, orderTypeId, item.id)
      setBusyId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setOverrides((prev) => prev.filter((row) => row.menu_item_id !== item.id))
      toast.success(`${item.name} back to the markup price`)
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tags className="h-4 w-4" />
            Item prices on the register
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Set an exact price for a dish on this order type. Blank means the markup applies.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="pl-8"
            aria-label="Search menu items"
          />
        </div>
      </CardHeader>

      <CardContent>
        {menuItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No menu items yet. Add dishes to the menu first.
          </p>
        ) : visibleItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No items match your search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Store price</th>
                  <th className="py-2 pr-3 font-medium">Register price</th>
                  <th className="py-2 pr-3 font-medium">Exact price</th>
                  <th className="py-2 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const storePrice = effectiveStorePrice(item)
                  const isCustom = pricing?.itemPrices[item.id] !== undefined
                  const registerPrice = resolveItemPrice(item.id, storePrice, pricing)
                  const isBusy = busyId === item.id

                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.name}</span>
                          {isCustom && (
                            <Badge variant="secondary" className="text-[10px]">
                              Custom
                            </Badge>
                          )}
                        </div>
                        {item.category_name && (
                          <p className="text-xs text-muted-foreground">{item.category_name}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {formatPeso(storePrice)}
                      </td>
                      <td className="py-2 pr-3 tabular-nums font-medium">{formatPeso(registerPrice)}</td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          disabled={isBusy}
                          value={drafts[item.id] ?? ''}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder={formatPeso(registerPrice)}
                          className="w-28"
                          aria-label={`Exact price for ${item.name}`}
                        />
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          <Button type="button" size="sm" disabled={isBusy} onClick={() => setPrice(item)}>
                            Set
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isBusy || !isCustom}
                            onClick={() => clearPrice(item)}
                          >
                            Clear
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
