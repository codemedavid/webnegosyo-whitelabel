'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Search, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  saveOutletMenuOverrideAction,
  clearOutletMenuOverrideAction,
} from '@/app/actions/outlet-menu'
import {
  buildOutletMenuIndex,
  findOutletMenuOverride,
  resolveItemForOutlet,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'
import type { Category, MenuItem, OutletMenuOverride } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'

interface BranchMenuPanelProps {
  tenantId: string
  tenantSlug: string
  outletId: string
  outletName: string
  items: readonly MenuItem[]
  categories: readonly Category[]
  initialOverrides: readonly OutletMenuOverride[]
}

/**
 * One branch's menu, as the person running that branch edits it.
 *
 * The list is the STORE-WIDE menu with this branch's answers on each row, not a
 * list of override rows — a merchant thinks "what do we sell here", and a table
 * that only showed the dishes already differing would hide every dish they were
 * looking for. A row with no override reads as "same as the rest of the store",
 * and the price field shows the store price as a placeholder so the inherited
 * value is visible without pretending it was typed here.
 */
export function BranchMenuPanel({
  tenantId,
  tenantSlug,
  outletId,
  outletName,
  items,
  categories,
  initialOverrides,
}: BranchMenuPanelProps) {
  const [overrides, setOverrides] = useState<OutletMenuOverride[]>([...initialOverrides])
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()
  const [savingId, setSavingId] = useState<string | null>(null)

  const index = useMemo(
    () => buildOutletMenuIndex(overrides as unknown as OutletMenuOverrideRow[]),
    [overrides]
  )

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) => item.name.toLowerCase().includes(query))
  }, [items, search])

  const applyPatch = (
    menuItemId: string,
    patch: Parameters<typeof saveOutletMenuOverrideAction>[4]
  ) => {
    setSavingId(menuItemId)
    startTransition(async () => {
      const result = await saveOutletMenuOverrideAction(
        tenantId,
        tenantSlug,
        outletId,
        menuItemId,
        patch
      )
      setSavingId(null)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      // The row is replaced wholesale by what the server stored — including the
      // null that means "back to the store-wide menu" — so the screen can never
      // drift from the database on a partial edit.
      setOverrides((prev) => {
        const rest = prev.filter((row) => row.menu_item_id !== menuItemId)
        return result.data ? [...rest, result.data] : rest
      })
    })
  }

  const reset = (menuItemId: string) => {
    setSavingId(menuItemId)
    startTransition(async () => {
      const result = await clearOutletMenuOverrideAction(
        tenantId,
        tenantSlug,
        outletId,
        menuItemId
      )
      setSavingId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setOverrides((prev) => prev.filter((row) => row.menu_item_id !== menuItemId))
      toast.success('Back to the store-wide menu')
    })
  }

  /** Blank means inherit; a typed 0 is a real free item and must survive. */
  const parsePrice = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">What {outletName} sells</h3>
          <p className="text-sm text-muted-foreground">
            Leave a row untouched and it matches the rest of the store.
          </p>
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes"
            className="pl-9"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {items.length === 0 ? 'This store has no menu items yet.' : 'No dishes match that search.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Dish</th>
                <th className="px-4 py-2 font-medium">On the menu</th>
                <th className="px-4 py-2 font-medium">In stock</th>
                <th className="px-4 py-2 font-medium">Price here</th>
                <th className="px-4 py-2 font-medium">Sale price</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const override = findOutletMenuOverride(index, outletId, item.id)
                const resolved = resolveItemForOutlet(item, override)
                const isBusy = savingId === item.id
                const inherits = override === null

                return (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {categoryName.get(item.category_id ?? '') ?? 'Uncategorised'}
                        {' · store price '}
                        {formatPrice(item.price)}
                      </div>
                      {item.is_available === false && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          Out of stock store-wide
                        </Badge>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <Switch
                        checked={override?.is_listed ?? true}
                        disabled={isBusy}
                        onCheckedChange={(checked) =>
                          applyPatch(item.id, { is_listed: checked })
                        }
                        aria-label={`${item.name} on the menu at ${outletName}`}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <Switch
                        // A dish the merchant took off the whole menu cannot be
                        // put back in stock from one branch, so the control says
                        // so rather than accepting a change with no effect.
                        checked={resolved.is_available !== false}
                        disabled={isBusy || item.is_available === false}
                        onCheckedChange={(checked) =>
                          applyPatch(item.id, { is_available: checked })
                        }
                        aria-label={`${item.name} in stock at ${outletName}`}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        disabled={isBusy}
                        defaultValue={override?.price ?? ''}
                        placeholder={String(item.price)}
                        className="w-28"
                        aria-label={`${item.name} price at ${outletName}`}
                        onBlur={(e) => {
                          const next = parsePrice(e.target.value)
                          if (next === (override?.price ?? null)) return
                          applyPatch(item.id, { price: next })
                        }}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        disabled={isBusy}
                        defaultValue={override?.discounted_price ?? ''}
                        placeholder={item.discounted_price ? String(item.discounted_price) : '—'}
                        className="w-28"
                        aria-label={`${item.name} sale price at ${outletName}`}
                        onBlur={(e) => {
                          const next = parsePrice(e.target.value)
                          if (next === (override?.discounted_price ?? null)) return
                          applyPatch(item.id, {
                            discounted_price: next,
                            // Typing a sale price cancels an opt-out; the two are
                            // contradictory and the database refuses both.
                            ...(next !== null ? { discount_cleared: false } : {}),
                          })
                        }}
                      />
                    </td>

                    <td className="px-4 py-3 text-right">
                      {inherits ? (
                        <span className="text-xs text-muted-foreground">Same as store</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => reset(item.id)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Reset
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
