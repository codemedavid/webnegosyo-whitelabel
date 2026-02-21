'use client'

import { useState, useTransition } from 'react'
import {
  Star,
  Tractor,
  HelpCircle,
  Dog,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Sparkles,
  Save,
  ArrowRight,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  updateBcgClassificationAction,
  updateBadgeTextAction,
  promoteItemAction,
  hideItemAction,
  createUpsellPairAction,
  deleteUpsellPairAction,
  updateCheckoutUpsellSettingsAction,
} from '@/app/actions/menu-engineering'
import type { MenuItem, Category, BcgClassification, UpsellPairWithItems } from '@/types/database'
import { toast } from 'sonner'

// ============================================
// Types
// ============================================

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

interface MenuEngineeringDashboardProps {
  menuItems: MenuItemWithCategory[]
  categories: Category[]
  upsellPairs: UpsellPairWithItems[]
  tenantId: string
  tenantSlug: string
  checkoutUpsellEnabled: boolean
  checkoutUpsellTitle: string
  checkoutUpsellSubtitle: string
  checkoutUpsellMaxItems: number
}

// ============================================
// Constants
// ============================================

const BCG_CONFIG: Record<BcgClassification, { label: string; icon: typeof Star; color: string; bgColor: string; description: string }> = {
  star: {
    label: 'Stars',
    icon: Star,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 border-yellow-200',
    description: 'High popularity, high profit',
  },
  plowhorse: {
    label: 'Plowhorses',
    icon: Tractor,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    description: 'High popularity, low profit',
  },
  puzzle: {
    label: 'Puzzles',
    icon: HelpCircle,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    description: 'Low popularity, high profit',
  },
  dog: {
    label: 'Dogs',
    icon: Dog,
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    description: 'Low popularity, low profit',
  },
  unclassified: {
    label: 'Unclassified',
    icon: HelpCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50 border-gray-200',
    description: 'Not yet classified',
  },
}

const CLASSIFICATIONS: BcgClassification[] = ['star', 'plowhorse', 'puzzle', 'dog', 'unclassified']

// ============================================
// BCG Matrix Tab
// ============================================

function BcgMatrixTab({
  menuItems,
  tenantId,
  tenantSlug,
}: {
  menuItems: MenuItemWithCategory[]
  tenantId: string
  tenantSlug: string
}) {
  const [isPending, startTransition] = useTransition()
  const [filterClassification, setFilterClassification] = useState<BcgClassification | 'all'>('all')
  const [badgeInputs, setBadgeInputs] = useState<Record<string, string>>({})
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkClassification, setBulkClassification] = useState<BcgClassification>('star')

  // Count items per classification
  const counts = CLASSIFICATIONS.reduce((acc, cls) => {
    acc[cls] = menuItems.filter((item) => (item.bcg_classification || 'unclassified') === cls).length
    return acc
  }, {} as Record<BcgClassification, number>)

  const filteredItems = filterClassification === 'all'
    ? menuItems
    : menuItems.filter((item) => (item.bcg_classification || 'unclassified') === filterClassification)

  const handleClassify = (itemId: string, classification: BcgClassification) => {
    startTransition(async () => {
      const result = await updateBcgClassificationAction(itemId, tenantId, tenantSlug, classification)
      if (result.success) {
        toast.success('Classification updated')
      } else {
        toast.error(result.error || 'Failed to update')
      }
    })
  }

  const handleBadgeUpdate = (itemId: string) => {
    const badgeText = badgeInputs[itemId] || null
    startTransition(async () => {
      const result = await updateBadgeTextAction(itemId, tenantId, tenantSlug, badgeText || null)
      if (result.success) {
        toast.success(badgeText ? 'Badge set' : 'Badge cleared')
      } else {
        toast.error(result.error || 'Failed to update badge')
      }
    })
  }

  const handlePromote = (itemId: string, currentFeatured: boolean) => {
    startTransition(async () => {
      const result = await promoteItemAction(itemId, tenantId, tenantSlug, !currentFeatured)
      if (result.success) {
        toast.success(currentFeatured ? 'Removed from featured' : 'Promoted to featured')
      } else {
        toast.error(result.error || 'Failed to update')
      }
    })
  }

  const handleHide = (itemId: string, currentAvailable: boolean) => {
    startTransition(async () => {
      const result = await hideItemAction(itemId, tenantId, tenantSlug, !currentAvailable)
      if (result.success) {
        toast.success(currentAvailable ? 'Item hidden' : 'Item made visible')
      } else {
        toast.error(result.error || 'Failed to update')
      }
    })
  }

  const handleBulkClassify = () => {
    if (selectedItems.size === 0) {
      toast.error('Select at least one item')
      return
    }
    startTransition(async () => {
      const { bulkUpdateBcgAction } = await import('@/app/actions/menu-engineering')
      const updates = Array.from(selectedItems).map((itemId) => ({
        itemId,
        classification: bulkClassification,
      }))
      const result = await bulkUpdateBcgAction(tenantId, tenantSlug, updates)
      if (result.success) {
        toast.success(`${selectedItems.size} items classified as ${BCG_CONFIG[bulkClassification].label}`)
        setSelectedItems(new Set())
      } else {
        toast.error(result.error || 'Failed to bulk update')
      }
    })
  }

  const toggleSelectItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)))
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {CLASSIFICATIONS.map((cls) => {
          const config = BCG_CONFIG[cls]
          const Icon = config.icon
          return (
            <Card
              key={cls}
              className={`cursor-pointer border ${filterClassification === cls ? config.bgColor : ''}`}
              onClick={() => setFilterClassification(filterClassification === cls ? 'all' : cls)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-8 w-8 ${config.color}`} />
                <div>
                  <p className="text-2xl font-bold">{counts[cls]}</p>
                  <p className="text-xs text-muted-foreground">{config.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quadrant Grid */}
      <Card>
        <CardHeader>
          <CardTitle>BCG Matrix Quadrant</CardTitle>
          <CardDescription>Visual overview of item classification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {(['star', 'puzzle', 'plowhorse', 'dog'] as BcgClassification[]).map((cls) => {
              const config = BCG_CONFIG[cls]
              const Icon = config.icon
              const items = menuItems.filter((item) => (item.bcg_classification || 'unclassified') === cls)
              return (
                <div key={cls} className={`rounded-lg border p-4 ${config.bgColor}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config.color}`} />
                    <span className="text-sm font-semibold">{config.label}</span>
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">{config.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {items.slice(0, 8).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 text-xs"
                        title={item.name}
                      >
                        {item.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-5 w-5 rounded object-cover"
                          />
                        )}
                        <span className="max-w-[80px] truncate">{item.name}</span>
                      </div>
                    ))}
                    {items.length > 8 && (
                      <span className="text-xs text-muted-foreground">+{items.length - 8} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 text-center text-xs text-muted-foreground">
            <span>High Popularity</span>
            <span>Low Popularity</span>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <Card className="border-primary">
          <CardContent className="flex items-center gap-4 p-4">
            <span className="text-sm font-medium">{selectedItems.size} selected</span>
            <Select
              value={bulkClassification}
              onValueChange={(v) => setBulkClassification(v as BcgClassification)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    {BCG_CONFIG[cls].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleBulkClassify} disabled={isPending}>
              Apply Classification
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedItems(new Set())}>
              Clear Selection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Item List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Menu Items {filterClassification !== 'all' && `— ${BCG_CONFIG[filterClassification].label}`}
              </CardTitle>
              <CardDescription>{filteredItems.length} items</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4"
                />
                Select All
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const cls = (item.bcg_classification || 'unclassified') as BcgClassification
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleSelectItem(item.id)}
                    className="h-4 w-4"
                  />
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-12 w-12 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{item.name}</span>
                      {item.badge_text && (
                        <Badge variant="secondary" className="text-xs">{item.badge_text}</Badge>
                      )}
                      {!item.is_available && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Hidden</Badge>
                      )}
                      {item.is_featured && (
                        <Badge className="text-xs bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Featured</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.category?.name || 'No category'} · ${item.price.toFixed(2)}
                    </p>
                  </div>

                  {/* Classification Select */}
                  <Select
                    value={cls}
                    onValueChange={(v) => handleClassify(item.id, v as BcgClassification)}
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFICATIONS.map((c) => {
                        const Icon = BCG_CONFIG[c].icon
                        return (
                          <SelectItem key={c} value={c}>
                            <span className="flex items-center gap-2">
                              <Icon className={`h-3 w-3 ${BCG_CONFIG[c].color}`} />
                              {BCG_CONFIG[c].label}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title={item.is_featured ? 'Remove from featured' : 'Promote to featured'}
                      onClick={() => handlePromote(item.id, !!item.is_featured)}
                      disabled={isPending}
                    >
                      <Sparkles className={`h-4 w-4 ${item.is_featured ? 'text-yellow-500' : ''}`} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={item.is_available ? 'Hide item' : 'Show item'}
                      onClick={() => handleHide(item.id, item.is_available)}
                      disabled={isPending}
                    >
                      {item.is_available ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Badge Input */}
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="Badge text"
                      className="w-28 h-8 text-xs"
                      value={badgeInputs[item.id] ?? item.badge_text ?? ''}
                      onChange={(e) =>
                        setBadgeInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleBadgeUpdate(item.id)}
                      disabled={isPending}
                      title="Save badge"
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
            {filteredItems.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No items found for this classification.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================
// Upsell Pairs Tab
// ============================================

function UpsellPairsTab({
  menuItems,
  upsellPairs,
  tenantId,
  tenantSlug,
}: {
  menuItems: MenuItemWithCategory[]
  upsellPairs: UpsellPairWithItems[]
  tenantId: string
  tenantSlug: string
}) {
  const [isPending, startTransition] = useTransition()
  const [sourceItemId, setSourceItemId] = useState('')
  const [targetItemId, setTargetItemId] = useState('')
  const [pairType, setPairType] = useState<'complementary' | 'upgrade'>('complementary')
  const [upgradeHeader, setUpgradeHeader] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [targetLabel, setTargetLabel] = useState('')

  const handleCreatePair = () => {
    if (!sourceItemId || !targetItemId) {
      toast.error('Select both source and target items')
      return
    }
    if (sourceItemId === targetItemId) {
      toast.error('Source and target must be different items')
      return
    }

    startTransition(async () => {
      const result = await createUpsellPairAction(tenantId, tenantSlug, {
        source_item_id: sourceItemId,
        target_item_id: targetItemId,
        pair_type: pairType,
        ...(pairType === 'upgrade' ? {
          upgrade_header: upgradeHeader || undefined,
          source_label: sourceLabel || undefined,
          target_label: targetLabel || undefined,
        } : {}),
      })
      if (result.success) {
        toast.success('Upsell pair created')
        setSourceItemId('')
        setTargetItemId('')
        setUpgradeHeader('')
        setSourceLabel('')
        setTargetLabel('')
      } else {
        toast.error(result.error || 'Failed to create pair')
      }
    })
  }

  const handleDeletePair = (pairId: string) => {
    startTransition(async () => {
      const result = await deleteUpsellPairAction(pairId, tenantId, tenantSlug)
      if (result.success) {
        toast.success('Upsell pair deleted')
      } else {
        toast.error(result.error || 'Failed to delete pair')
      }
    })
  }

  const availableItems = menuItems.filter((item) => item.is_available)

  return (
    <div className="space-y-6">
      {/* Add Pair Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Upsell Pair</CardTitle>
          <CardDescription>
            Create item-to-item relationships for upsell suggestions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label>Source Item</Label>
              <Select value={sourceItemId} onValueChange={setSourceItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="When customer orders..." />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} (P{item.price.toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ArrowRight className="mb-2 h-5 w-5 text-muted-foreground hidden sm:block" />

            <div className="min-w-[200px] flex-1 space-y-2">
              <Label>Target Item</Label>
              <Select value={targetItemId} onValueChange={setTargetItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Suggest this item..." />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} (${item.price.toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={pairType === 'complementary'}
                    onChange={() => setPairType('complementary')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Complementary</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={pairType === 'upgrade'}
                    onChange={() => setPairType('upgrade')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Upgrade</span>
                </label>
              </div>
            </div>

            <Button onClick={handleCreatePair} disabled={isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Add Pair
            </Button>
          </div>

          {/* Upgrade-specific labels (only shown for upgrade type) */}
          {pairType === 'upgrade' && (
            <div className="mt-4 space-y-4 rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium text-muted-foreground">
                Customize the upgrade comparison labels (optional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="upgrade-header">Header Text</Label>
                  <Input
                    id="upgrade-header"
                    placeholder="e.g. Want to make it a meal?"
                    value={upgradeHeader}
                    onChange={(e) => setUpgradeHeader(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: &quot;Upgrade your [item]?&quot;
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-label">Current Item Label</Label>
                  <Input
                    id="source-label"
                    placeholder="e.g. A la carte"
                    value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: &quot;Current&quot;
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-label">Upgrade Item Label</Label>
                  <Input
                    id="target-label"
                    placeholder="e.g. Meal"
                    value={targetLabel}
                    onChange={(e) => setTargetLabel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: &quot;Upgrade&quot;
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Pairs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Upsell Pairs</CardTitle>
          <CardDescription>{upsellPairs.length} pairs configured</CardDescription>
        </CardHeader>
        <CardContent>
          {upsellPairs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No upsell pairs configured yet. Add your first pair above.
            </p>
          ) : (
            <div className="space-y-2">
              {upsellPairs.map((pair) => (
                <div
                  key={pair.id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  {/* Source Item */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {pair.source_item?.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pair.source_item.image_url}
                        alt={pair.source_item.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                    <span className="text-sm font-medium truncate">
                      {pair.source_item?.name || 'Unknown'}
                    </span>
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                  {/* Target Item */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {pair.target_item?.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pair.target_item.image_url}
                        alt={pair.target_item.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                    <span className="text-sm font-medium truncate">
                      {pair.target_item?.name || 'Unknown'}
                    </span>
                  </div>

                  {/* Type Badge + Labels */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={pair.pair_type === 'complementary' ? 'secondary' : 'default'}>
                      {pair.pair_type}
                    </Badge>
                    {pair.pair_type === 'upgrade' && (pair.source_label || pair.target_label) && (
                      <span className="text-[10px] text-muted-foreground">
                        {pair.source_label || 'Current'} → {pair.target_label || 'Upgrade'}
                      </span>
                    )}
                  </div>

                  {/* Delete */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeletePair(pair.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================
// Checkout Upsell Settings Tab
// ============================================

function CheckoutUpsellSettingsTab({
  tenantId,
  tenantSlug,
  initialEnabled,
  initialTitle,
  initialSubtitle,
  initialMaxItems,
}: {
  tenantId: string
  tenantSlug: string
  initialEnabled: boolean
  initialTitle: string
  initialSubtitle: string
  initialMaxItems: number
}) {
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [title, setTitle] = useState(initialTitle)
  const [subtitle, setSubtitle] = useState(initialSubtitle)
  const [maxItems, setMaxItems] = useState(initialMaxItems)

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checkout Upsell Settings</CardTitle>
        <CardDescription>
          Configure the interstitial modal that appears before checkout, suggesting additional items to customers.
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

        {/* Settings (shown always, disabled when toggle is off) */}
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
              Number of suggested items to show (1–8)
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          <Save className="mr-2 h-4 w-4" />
          {isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================
// Main Dashboard Component
// ============================================

export function MenuEngineeringDashboard({
  menuItems,
  upsellPairs,
  tenantId,
  tenantSlug,
  checkoutUpsellEnabled,
  checkoutUpsellTitle,
  checkoutUpsellSubtitle,
  checkoutUpsellMaxItems,
}: MenuEngineeringDashboardProps) {
  return (
    <Tabs defaultValue="bcg" className="space-y-6">
      <TabsList>
        <TabsTrigger value="bcg">BCG Matrix</TabsTrigger>
        <TabsTrigger value="upsells">Upsell Pairs</TabsTrigger>
        <TabsTrigger value="checkout">Checkout Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="bcg">
        <BcgMatrixTab
          menuItems={menuItems}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
        />
      </TabsContent>

      <TabsContent value="upsells">
        <UpsellPairsTab
          menuItems={menuItems}
          upsellPairs={upsellPairs}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
        />
      </TabsContent>

      <TabsContent value="checkout">
        <CheckoutUpsellSettingsTab
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          initialEnabled={checkoutUpsellEnabled}
          initialTitle={checkoutUpsellTitle}
          initialSubtitle={checkoutUpsellSubtitle}
          initialMaxItems={checkoutUpsellMaxItems}
        />
      </TabsContent>
    </Tabs>
  )
}
