'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X, Search, CheckCircle2, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItemWithCategory, UpsellPairWithItems, BundleWithSlots } from '@/types/database'

interface UpsellPreviewPanelProps {
  menuItems: MenuItemWithCategory[]
  upsellPairs: UpsellPairWithItems[]
  bundles: BundleWithSlots[]
  onClose: () => void
}

type StepResult = {
  step: string
  label: string
  status: 'shown' | 'skipped' | 'none'
  detail: string
  items?: string[]
}

export function UpsellPreviewPanel({
  menuItems,
  upsellPairs,
  bundles,
  onClose,
}: UpsellPreviewPanelProps) {
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<MenuItemWithCategory | null>(null)

  const filteredItems = useMemo(() => {
    if (!search) return []
    const q = search.toLowerCase()
    return menuItems.filter(i => i.name.toLowerCase().includes(q)).slice(0, 6)
  }, [search, menuItems])

  // Simulate the orchestrator logic for the selected item
  const steps = useMemo((): StepResult[] => {
    if (!selectedItem) return []

    let budgetUsed = 0
    const results: StepResult[] = []

    // Step 1: Product page — check for upgrade pairs
    const upgradePairs = upsellPairs.filter(
      p => p.is_active && p.pair_type === 'upgrade' && p.source_item_id === selectedItem.id
    )
    const matchingBundles = bundles.filter(b =>
      b.is_active && b.show_as_upsell &&
      b.slots?.some(s => s.category_id === selectedItem.category_id)
    )

    if (upgradePairs.length > 0 && budgetUsed < 2) {
      results.push({
        step: '1',
        label: 'Product Page',
        status: 'shown',
        detail: `"Upgrade to Meal" — ${upgradePairs.length} upgrade option(s) available`,
      })
      budgetUsed++
    } else if (matchingBundles.length > 0 && budgetUsed < 2) {
      results.push({
        step: '1',
        label: 'Product Page',
        status: 'shown',
        detail: `"Bundle Upsell" — ${matchingBundles.length} combo(s) suggested`,
        items: matchingBundles.map(b => b.name),
      })
      budgetUsed++
    } else {
      results.push({
        step: '1',
        label: 'Product Page',
        status: 'none',
        detail: 'No upgrade or bundle configured for this item',
      })
    }

    // Step 2: After add to cart — check for complementary pairs
    const compPairs = upsellPairs.filter(
      p => p.is_active && p.pair_type === 'complementary' && p.source_item_id === selectedItem.id
    )

    if (compPairs.length > 0 && budgetUsed < 2) {
      results.push({
        step: '2',
        label: 'After Add to Cart',
        status: 'shown',
        detail: `"Goes well with" — ${compPairs.length} suggestion(s)`,
      })
      budgetUsed++
    } else if (compPairs.length > 0 && budgetUsed >= 2) {
      results.push({
        step: '2',
        label: 'After Add to Cart',
        status: 'skipped',
        detail: 'Pair suggestion available but skipped — budget used by earlier prompt',
      })
    } else {
      results.push({
        step: '2',
        label: 'After Add to Cart',
        status: 'none',
        detail: 'No pair suggestions configured for this item',
      })
    }

    // Step 3: Checkout — always check for checkout picks
    const checkoutPicks = menuItems.filter(
      i => i.show_in_checkout_upsell && i.id !== selectedItem.id
    )

    if (checkoutPicks.length > 0) {
      results.push({
        step: '3',
        label: 'Checkout',
        status: 'shown',
        detail: `${checkoutPicks.length} checkout pick(s) available`,
        items: checkoutPicks.slice(0, 4).map(i => i.name),
      })
    } else {
      results.push({
        step: '3',
        label: 'Checkout',
        status: 'none',
        detail: 'No checkout picks configured',
      })
    }

    return results
  }, [selectedItem, upsellPairs, bundles, menuItems])

  const upsellMoments = steps.filter(s => s.status === 'shown').length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Preview Customer Experience</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {/* Item selector */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Select a menu item to simulate..."
            value={selectedItem ? selectedItem.name : search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedItem(null)
            }}
            className="pl-9"
          />
          {filteredItems.length > 0 && !selectedItem && (
            <div className="absolute z-10 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                  onClick={() => { setSelectedItem(item); setSearch('') }}
                >
                  {item.name} — {formatPrice(item.price)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Simulation results */}
        {selectedItem && steps.length > 0 && (
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={step.step}>
                <div className="flex items-start gap-3">
                  {step.status === 'shown' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                  ) : step.status === 'skipped' ? (
                    <SkipForward className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      Step {step.step}: {step.label}
                      {step.status === 'shown' && (
                        <Badge variant="outline" className="ml-2 text-green-700 border-green-300">Active</Badge>
                      )}
                      {step.status === 'skipped' && (
                        <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">Skipped</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                    {step.items && step.items.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Items: {step.items.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className="ml-2.5 mt-1 mb-1 border-l-2 border-dashed h-4 border-muted" />
                )}
              </div>
            ))}

            <div className="pt-3 border-t">
              <p className="text-sm">
                Customer sees <span className="font-semibold">{upsellMoments} upsell moment{upsellMoments !== 1 ? 's' : ''}</span>.
              </p>
              {upsellMoments === 0 && (
                <p className="text-sm text-amber-600 mt-1">
                  No upsell moments for this item. Consider pushing it via the quick-add bar above.
                </p>
              )}
            </div>
          </div>
        )}

        {!selectedItem && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Search for a menu item to see what your customers will experience.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
