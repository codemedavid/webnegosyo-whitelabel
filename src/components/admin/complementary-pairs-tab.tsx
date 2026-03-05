'use client'

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react'
import {
  Trash2,
  ArrowRight,
  Search,
  ShoppingBag,
  Check,
  Utensils,
  FolderOpen,
  Pencil,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getComplementaryPairsAction,
  updateComplementaryPairsAction,
  deleteComplementaryPairAction,
} from '@/app/actions/complementary-pairs'
import type { MenuItem, Category, ComplementaryPairWithDetails } from '@/types/database'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'

interface MenuItemWithCategoryRaw extends MenuItem {
  category?: { id: string; name: string } | string | null
}

interface NormalizedMenuItem extends MenuItem {
  categoryName: string
}

interface ComplementaryPairsTabProps {
  menuItems: MenuItemWithCategoryRaw[]
  categories: Category[]
  tenantId: string
  tenantSlug: string
}

function normalizeCategoryName(category: MenuItemWithCategoryRaw['category']): string {
  if (!category) return ''
  if (typeof category === 'string') return category
  return typeof category.name === 'string' ? category.name : ''
}

/** Safely extract a string for rendering — prevents "Objects are not valid as a React child" */
function safeStr(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

interface GroupedPairs {
  sourceType: 'item' | 'category'
  sourceId: string
  sourceName: string
  sourceImage?: string | null
  pairs: ComplementaryPairWithDetails[]
}

export function ComplementaryPairsTab({
  menuItems: rawMenuItems,
  categories,
  tenantId,
  tenantSlug,
}: ComplementaryPairsTabProps) {
  // Normalize category from object { id, name } to plain string to avoid
  // "Objects are not valid as a React child" errors in Select rendering
  const menuItems = useMemo<NormalizedMenuItem[]>(
    () => rawMenuItems.map((item) => {
      // Destructure out `category` (object {id,name}) so it never leaks as a React child
      const { category, ...rest } = item
      return {
        ...rest,
        categoryName: normalizeCategoryName(category),
      }
    }),
    [rawMenuItems]
  )

  const [isPending, startTransition] = useTransition()
  const [pairs, setPairs] = useState<ComplementaryPairWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Form state
  const [sourceType, setSourceType] = useState<'item' | 'category'>('item')
  const [sourceItemId, setSourceItemId] = useState('')
  const [sourceCategoryId, setSourceCategoryId] = useState('')
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())
  const [targetSearch, setTargetSearch] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Filter state
  const [listFilter, setListFilter] = useState<'all' | 'item' | 'category'>('all')

  const MAX_TARGETS = 4

  // Simple fetch function for save/delete handlers to call
  const fetchPairs = async () => {
    setIsLoading(true)
    try {
      const result = await getComplementaryPairsAction(tenantId)
      setPairs(result)
    } catch {
      toast.error('Failed to load complementary pairs')
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch pairs on mount with cancellation
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const result = await getComplementaryPairsAction(tenantId)
        if (!cancelled) setPairs(result)
      } catch {
        if (!cancelled) toast.error('Failed to load complementary pairs')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tenantId])

  const availableItems = useMemo(
    () => menuItems.filter((item) => item.is_available),
    [menuItems]
  )

  const sourceId = sourceType === 'item' ? sourceItemId : sourceCategoryId

  // Items available as targets (exclude source item in per-item mode)
  const filteredTargetItems = useMemo(() => {
    let items = availableItems
    if (sourceType === 'item' && sourceItemId) {
      items = items.filter((item) => item.id !== sourceItemId)
    }
    if (targetSearch) {
      const q = targetSearch.toLowerCase()
      items = items.filter((item) => item.name.toLowerCase().includes(q))
    }
    // Sort selected first, then alphabetical
    return [...items].sort((a, b) => {
      const aSelected = selectedTargetIds.has(a.id) ? 0 : 1
      const bSelected = selectedTargetIds.has(b.id) ? 0 : 1
      if (aSelected !== bSelected) return aSelected - bSelected
      return a.name.localeCompare(b.name)
    })
  }, [availableItems, sourceType, sourceItemId, targetSearch, selectedTargetIds])

  // Group pairs by source
  const groupedPairs = useMemo(() => {
    const groups = new Map<string, GroupedPairs>()

    for (const pair of pairs) {
      const key = pair.source_type === 'item'
        ? `item:${pair.source_item_id}`
        : `category:${pair.source_category_id}`

      if (!groups.has(key)) {
        const sourceName = pair.source_type === 'item'
          ? safeStr(pair.source_item?.name) || 'Unknown Item'
          : safeStr(pair.source_category?.name) || 'Unknown Category'
        const sourceImage = pair.source_type === 'item'
          ? safeStr(pair.source_item?.image_url)
          : null

        groups.set(key, {
          sourceType: pair.source_type,
          sourceId: (pair.source_type === 'item' ? pair.source_item_id : pair.source_category_id) || '',
          sourceName,
          sourceImage,
          pairs: [],
        })
      }
      groups.get(key)!.pairs.push(pair)
    }

    let result = Array.from(groups.values())
    if (listFilter !== 'all') {
      result = result.filter((g) => g.sourceType === listFilter)
    }
    return result
  }, [pairs, listFilter])

  const handleToggleTarget = useCallback((itemId: string) => {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else if (next.size < MAX_TARGETS) {
        next.add(itemId)
      } else {
        toast.error(`Maximum ${MAX_TARGETS} complementary items allowed`)
        return prev
      }
      return next
    })
  }, [])

  const handleSave = () => {
    if (!sourceId) {
      toast.error('Please select a source')
      return
    }
    if (selectedTargetIds.size === 0) {
      toast.error('Please select at least one complementary item')
      return
    }

    startTransition(async () => {
      const result = await updateComplementaryPairsAction(
        tenantId,
        tenantSlug,
        sourceType,
        sourceId,
        [...selectedTargetIds]
      )
      if (result.success) {
        toast.success(isEditing ? 'Complementary pairs updated' : 'Complementary pairs created')
        resetForm()
        await fetchPairs()
      } else {
        toast.error(result.error || 'Failed to save complementary pairs')
      }
    })
  }

  const handleEditGroup = (group: GroupedPairs) => {
    setSourceType(group.sourceType)
    if (group.sourceType === 'item') {
      setSourceItemId(group.sourceId)
      setSourceCategoryId('')
    } else {
      setSourceCategoryId(group.sourceId)
      setSourceItemId('')
    }
    setSelectedTargetIds(new Set(group.pairs.map((p) => p.target_item_id)))
    setIsEditing(true)
    setTargetSearch('')
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteGroup = (group: GroupedPairs) => {
    if (!confirm(`Delete all complementary pairs for "${group.sourceName}"?`)) return

    startTransition(async () => {
      let allSuccess = true
      for (const pair of group.pairs) {
        const result = await deleteComplementaryPairAction(pair.id, tenantId, tenantSlug)
        if (!result.success) {
          allSuccess = false
          toast.error(result.error || `Failed to delete pair ${pair.id}`)
          break
        }
      }
      if (allSuccess) {
        toast.success(`Deleted all pairs for "${group.sourceName}"`)
        await fetchPairs()
      }
    })
  }

  const resetForm = () => {
    setSourceItemId('')
    setSourceCategoryId('')
    setSelectedTargetIds(new Set())
    setTargetSearch('')
    setIsEditing(false)
  }

  const itemPairCount = groupedPairs.filter((g) => g.sourceType === 'item').length
  const categoryPairCount = groupedPairs.filter((g) => g.sourceType === 'category').length

  return (
    <div className="space-y-6">
      {/* Create/Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Complementary Pairs' : 'Create Complementary Pairs'}</CardTitle>
          <CardDescription>
            Configure &quot;Perfect with...&quot; suggestions shown after customers add items to cart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Source Type Toggle */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">
              Source Type
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSourceType('item')
                  setSourceCategoryId('')
                  if (!isEditing) setSelectedTargetIds(new Set())
                }}
                className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  sourceType === 'item'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  sourceType === 'item' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Per Item</p>
                  <p className="text-xs text-muted-foreground">
                    Pair specific items together
                  </p>
                </div>
                {sourceType === 'item' && (
                  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceType('category')
                  setSourceItemId('')
                  if (!isEditing) setSelectedTargetIds(new Set())
                }}
                className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  sourceType === 'category'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  sourceType === 'category' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  <FolderOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Per Category</p>
                  <p className="text-xs text-muted-foreground">
                    Apply to all items in a category
                  </p>
                </div>
                {sourceType === 'category' && (
                  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            </div>
          </div>

          {/* Source Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              {sourceType === 'item' ? 'Source Item' : 'Source Category'}
            </Label>
            {sourceType === 'item' ? (
              <Select value={sourceItemId} onValueChange={setSourceItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source item" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}{item.categoryName ? ` (${item.categoryName})` : ''} -- {formatPrice(item.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Select value={sourceCategoryId} onValueChange={setSourceCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c.is_active).map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  These will show for all items in this category unless overridden at item level.
                </p>
              </>
            )}
          </div>

          {/* Target Items Multi-Select */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                Complementary Items
              </Label>
              <Badge variant="secondary" className="text-xs">
                {selectedTargetIds.size} / {MAX_TARGETS} selected
              </Badge>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search menu items..."
                value={targetSearch}
                onChange={(e) => setTargetSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Item Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
              {filteredTargetItems.map((item) => {
                const isSelected = selectedTargetIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleTarget(item.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/10'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
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
                          <ShoppingBag className="h-4 w-4 text-gray-300" />
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
                        {item.categoryName && (
                          <span className="text-xs text-muted-foreground/60">
                            {item.categoryName}
                          </span>
                        )}
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

            {filteredTargetItems.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                {targetSearch ? 'No items match your search.' : 'No available menu items.'}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={isPending || !sourceId || selectedTargetIds.size === 0}
            >
              <Utensils className="mr-2 h-4 w-4" />
              {isPending ? 'Saving...' : isEditing ? 'Update Pairs' : 'Save Pairs'}
            </Button>
            {isEditing && (
              <Button variant="outline" onClick={resetForm}>
                Cancel Edit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Existing Pairs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Existing Complementary Pairs</CardTitle>
              <CardDescription className="mt-1">
                <span className="inline-flex items-center gap-3">
                  <span>{pairs.length} total pair{pairs.length !== 1 ? 's' : ''}</span>
                  {itemPairCount > 0 && (
                    <Badge variant="default" className="text-[10px]">
                      {itemPairCount} item source{itemPairCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {categoryPairCount > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {categoryPairCount} category source{categoryPairCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </span>
              </CardDescription>
            </div>

            {pairs.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={listFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setListFilter('all')}
                  className="h-8 text-xs"
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={listFilter === 'item' ? 'default' : 'outline'}
                  onClick={() => setListFilter('item')}
                  className="h-8 text-xs"
                >
                  Item Pairs
                </Button>
                <Button
                  size="sm"
                  variant={listFilter === 'category' ? 'default' : 'outline'}
                  onClick={() => setListFilter('category')}
                  className="h-8 text-xs"
                >
                  Category Pairs
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground animate-pulse">Loading pairs...</p>
            </div>
          ) : pairs.length === 0 ? (
            <div className="py-12 text-center">
              <Utensils className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No complementary pairs configured yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add pairs above to show &quot;Perfect with&quot; suggestions to customers after they add items to cart.
              </p>
            </div>
          ) : groupedPairs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No pairs match your filter.
            </p>
          ) : (
            <div className="space-y-4">
              {groupedPairs.map((group) => (
                <div
                  key={`${group.sourceType}:${group.sourceId}`}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Source info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Source thumbnail */}
                      {group.sourceType === 'item' && (
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {group.sourceImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={group.sourceImage}
                              alt={group.sourceName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                      )}
                      {group.sourceType === 'category' && (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <FolderOpen className="h-4 w-4 text-muted-foreground/60" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{group.sourceName}</p>
                        <Badge
                          variant={group.sourceType === 'item' ? 'default' : 'secondary'}
                          className="text-[10px] mt-0.5"
                        >
                          {group.sourceType === 'item' ? 'Item' : 'Category'}
                        </Badge>
                      </div>

                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                      {/* Target thumbnails */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {group.pairs.map((pair) => (
                          <div key={pair.id} className="flex flex-col items-center gap-1">
                            <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-muted">
                              {pair.target_item?.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={pair.target_item.image_url}
                                  alt={pair.target_item.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <ShoppingBag className="h-3 w-3 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground max-w-[60px] truncate text-center">
                              {safeStr(pair.target_item?.name) || 'Unknown'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEditGroup(group)}
                        disabled={isPending}
                        title="Edit pairs"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteGroup(group)}
                        disabled={isPending}
                        title="Delete all pairs for this source"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
