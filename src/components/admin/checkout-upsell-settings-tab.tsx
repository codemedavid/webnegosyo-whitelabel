'use client'

import { useState, useTransition, useMemo, useCallback, useRef } from 'react'
import {
  Save,
  ShoppingBag,
  Search,
  Check,
  Info,
  Filter,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  updateCheckoutUpsellSettingsAction,
  setCheckoutUpsellItemsAction,
} from '@/app/actions/menu-engineering'
import type { MenuItem } from '@/types/database'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface CheckoutUpsellSettingsTabProps {
  tenantId: string
  tenantSlug: string
  initialEnabled: boolean
  initialTitle: string
  initialSubtitle: string
  initialMaxItems: number
  menuItems: MenuItemWithCategory[]
}

export function CheckoutUpsellSettingsTab({
  tenantId,
  tenantSlug,
  initialEnabled,
  initialTitle,
  initialSubtitle,
  initialMaxItems,
  menuItems,
}: CheckoutUpsellSettingsTabProps) {
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [title, setTitle] = useState(initialTitle)
  const [subtitle, setSubtitle] = useState(initialSubtitle)
  const [maxItems, setMaxItems] = useState(initialMaxItems)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(menuItems.filter(i => i.show_in_checkout_upsell).map(i => i.id))
  )
  const [isSavingItems, setIsSavingItems] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>(JSON.stringify([...selectedIds].sort()))

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateCheckoutUpsellSettingsAction(tenantId, tenantSlug, {
        checkout_upsell_enabled: enabled,
        checkout_upsell_title: title,
        checkout_upsell_subtitle: subtitle,
        checkout_upsell_max_items: maxItems,
      })
      if (result.success) {
        toast.success('Checkout upsell settings saved')
      } else {
        toast.error(result.error || 'Failed to save settings')
      }
    })
  }

  // Debounced batch save -- waits 800ms after last toggle, then saves all at once
  const debouncedSaveItems = useCallback((newSelectedIds: Set<string>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(async () => {
      const idsArray = [...newSelectedIds]
      const currentHash = JSON.stringify(idsArray.sort())
      if (currentHash === lastSavedRef.current) return

      setIsSavingItems(true)
      const result = await setCheckoutUpsellItemsAction(tenantId, tenantSlug, idsArray)
      if (result.success) {
        lastSavedRef.current = currentHash
        toast.success('Upsell items updated')
      } else {
        toast.error(result.error || 'Failed to update items')
      }
      setIsSavingItems(false)
    }, 800)
  }, [tenantId, tenantSlug])

  const handleToggleItem = useCallback((itemId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      debouncedSaveItems(next)
      return next
    })
  }, [debouncedSaveItems])

  // Memoize filtered + sorted items
  const availableItems = useMemo(
    () => menuItems.filter(i => i.is_available),
    [menuItems]
  )

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Map<string, string>()
    for (const item of availableItems) {
      if (item.category) {
        cats.set(item.category.id, item.category.name)
      }
    }
    return Array.from(cats.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [availableItems])

  const sortedItems = useMemo(() => {
    let filtered = availableItems

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(i => i.category?.id === categoryFilter)
    }

    // Apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(i => i.name.toLowerCase().includes(q))
    }

    return [...filtered].sort((a, b) => {
      const aSelected = selectedIds.has(a.id) ? 0 : 1
      const bSelected = selectedIds.has(b.id) ? 0 : 1
      if (aSelected !== bSelected) return aSelected - bSelected
      return a.name.localeCompare(b.name)
    })
  }, [availableItems, searchQuery, categoryFilter, selectedIds])

  // Stats for selected items
  const selectedItemsList = useMemo(
    () => availableItems.filter(i => selectedIds.has(i.id)),
    [availableItems, selectedIds]
  )
  const avgPrice = selectedItemsList.length > 0
    ? selectedItemsList.reduce((sum, i) => sum + i.price, 0) / selectedItemsList.length
    : 0

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Checkout Upsell Settings</CardTitle>
          <CardDescription>
            Configure the interstitial modal that appears before checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="checkout-upsell-toggle" className="text-base font-medium">
                Enable Checkout Interstitial
              </Label>
              <p className="text-sm text-muted-foreground">
                Show upsell suggestions when customers proceed to checkout
              </p>
            </div>
            <Switch
              id="checkout-upsell-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <div className={`space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="space-y-2">
              <Label htmlFor="upsell-title">Title</Label>
              <Input
                id="upsell-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Before you go..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upsell-subtitle">Subtitle</Label>
              <Input
                id="upsell-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="You might also enjoy these items"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upsell-max-items">Max Items Shown</Label>
              <Input
                id="upsell-max-items"
                type="number"
                min={1}
                max={8}
                value={maxItems}
                onChange={(e) => setMaxItems(parseInt(e.target.value) || 4)}
              />
              <p className="text-xs text-muted-foreground">
                Number of suggested items to show (1-8)
              </p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isPending}>
            <Save className="mr-2 h-4 w-4" />
            {isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Item Picker Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Select Upsell Items</span>
            <div className="flex items-center gap-2">
              {isSavingItems && (
                <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
              )}
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
            </div>
          </CardTitle>
          <CardDescription>
            Choose which items appear in the checkout interstitial. Changes save automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Impact summary */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-950/30">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-sm text-blue-700 dark:text-blue-400">
                <strong>{selectedIds.size}</strong> item{selectedIds.size !== 1 ? 's' : ''} selected
                {' -- '}customers will see up to <strong>{Math.min(maxItems, selectedIds.size)}</strong> per session
                {avgPrice > 0 && (
                  <> (avg. {formatPrice(avgPrice)})</>
                )}
              </span>
            </div>
          )}

          {/* Search + Filter row */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search menu items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {categories.length > 1 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-48 shrink-0">
                  <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Item Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {sortedItems.map((item) => {
              const isSelected = selectedIds.has(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => handleToggleItem(item.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/10'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ShoppingBag className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/10" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatPrice(item.price)}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        {item.category?.name || 'Uncategorized'}
                      </span>
                    </div>
                  </div>

                  {/* Check indicator */}
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'border-2 border-muted-foreground/30'
                  }`}>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                </button>
              )
            })}
          </div>

          {sortedItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {searchQuery || categoryFilter !== 'all'
                ? 'No items found matching your filter.'
                : 'No available menu items.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
