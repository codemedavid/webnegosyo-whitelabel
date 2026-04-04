# Upgrade Pair Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, confusing upgrade pair creation form with a guided 3-step wizard that teaches merchants the concept while walking them through source item selection, upgrade item selection, and label customization with live preview.

**Architecture:** A wizard shell component manages step state and navigation, rendering one of three step components. A shared item grid component (searchable, filterable, visual cards) is used by Steps 1 and 2 with different decoration props. The wizard replaces the creation form inline within the existing `UpsellPairsTab`, keeping the existing pairs list and delete functionality intact.

**Tech Stack:** React (client components), Shadcn UI primitives, Tailwind CSS, existing `createUpsellPairAction` server action, `sonner` toasts, `formatPrice` from `cart-utils`.

---

## File Structure

```
src/components/admin/
├── upgrade-pair-wizard.tsx          — NEW: Wizard shell (step state, progress bar, navigation)
├── wizard-step-source.tsx           — NEW: Step 1 (source item selection)
├── wizard-step-target.tsx           — NEW: Step 2 (target item selection)
├── wizard-step-customize.tsx        — NEW: Step 3 (labels + preview + submit)
├── wizard-item-grid.tsx             — NEW: Shared searchable/filterable item grid
├── upsell-pairs-tab.tsx             — MODIFY: Remove old form + SmartUpgradePanel, add wizard toggle + edit button
└── smart-upgrade-panel.tsx          — DELETE (no longer imported anywhere after Task 6)
```

---

### Task 1: Shared Item Grid Component

**Files:**
- Create: `src/components/admin/wizard-item-grid.tsx`

This is the reusable visual item grid used by Steps 1 and 2. It handles search, category filtering, and item selection with visual cards.

- [ ] **Step 1: Create the WizardItemGrid component**

Create `src/components/admin/wizard-item-grid.tsx`:

```tsx
'use client'

import { useState, useMemo } from 'react'
import { Search, ShoppingBag } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatPrice } from '@/lib/cart-utils'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface PriceBadge {
  label: string
  variant: 'positive' | 'negative' | 'neutral'
}

export interface WizardItemGridProps {
  items: MenuItemWithCategory[]
  selectedItemId: string | null
  onSelect: (itemId: string) => void
  disabledItemId?: string | null
  disabledLabel?: string
  getPriceBadge?: (item: MenuItemWithCategory) => PriceBadge | null
}

export function WizardItemGrid({
  items,
  selectedItemId,
  onSelect,
  disabledItemId,
  disabledLabel = 'Already selected',
  getPriceBadge,
}: WizardItemGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const cats = new Map<string, string>()
    for (const item of items) {
      if (item.category) {
        cats.set(item.category.id, item.category.name)
      }
    }
    return Array.from(cats, ([id, name]) => ({ id, name }))
  }, [items])

  const filteredItems = useMemo(() => {
    let result = items
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((item) => item.name.toLowerCase().includes(q))
    }
    if (activeCategory) {
      result = result.filter((item) => item.category?.id === activeCategory)
    }
    return result
  }, [items, searchQuery, activeCategory])

  return (
    <div>
      {/* Search */}
      <div className="px-4 pt-4 pb-2 sm:px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category Pills */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 sm:px-5">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              activeCategory === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Item Grid */}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:px-5">
        {filteredItems.map((item) => {
          const isDisabled = item.id === disabledItemId
          const isSelected = item.id === selectedItemId
          const badge = getPriceBadge?.(item)

          return (
            <button
              key={item.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(item.id)}
              className={cn(
                'relative overflow-hidden rounded-xl border text-left transition-all',
                isDisabled && 'cursor-not-allowed opacity-35',
                isSelected &&
                  'border-primary ring-2 ring-primary/20 shadow-sm',
                !isSelected && !isDisabled && 'border-border hover:border-primary/40 hover:shadow-sm',
              )}
            >
              {/* Selection checkmark */}
              {isSelected && (
                <div className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              {/* Price badge */}
              {badge && !isDisabled && (
                <div
                  className={cn(
                    'absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[11px] font-bold text-white',
                    badge.variant === 'positive' && 'bg-green-500',
                    badge.variant === 'negative' && 'bg-amber-500',
                    badge.variant === 'neutral' && 'bg-muted-foreground',
                  )}
                >
                  {badge.label}
                </div>
              )}

              {/* Image */}
              <div className="aspect-[4/3] w-full bg-muted">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5">
                {isDisabled ? (
                  <>
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">{disabledLabel}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-xs font-semibold text-green-600 mt-0.5">
                      {formatPrice(item.price)}
                    </p>
                  </>
                )}
              </div>
            </button>
          )
        })}

        {filteredItems.length === 0 && (
          <div className="col-span-full py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No items match your search.' : 'No available items.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no lint errors**

Run: `npx eslint src/components/admin/wizard-item-grid.tsx --no-error-on-unmatched-pattern`
Expected: No errors (warnings about img element are suppressed with eslint-disable comment).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/wizard-item-grid.tsx
git commit -m "feat: add shared WizardItemGrid component for upgrade pair wizard"
```

---

### Task 2: Wizard Step 1 — Source Item Selection

**Files:**
- Create: `src/components/admin/wizard-step-source.tsx`

- [ ] **Step 1: Create the WizardStepSource component**

Create `src/components/admin/wizard-step-source.tsx`:

```tsx
'use client'

import { Lightbulb } from 'lucide-react'
import { WizardItemGrid } from '@/components/admin/wizard-item-grid'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface WizardStepSourceProps {
  items: MenuItemWithCategory[]
  selectedItemId: string | null
  onSelect: (itemId: string) => void
}

export function WizardStepSource({
  items,
  selectedItemId,
  onSelect,
}: WizardStepSourceProps) {
  return (
    <div>
      {/* Explainer */}
      <div className="mx-4 mt-4 flex gap-3 rounded-lg bg-green-50 p-3.5 dark:bg-green-950/30 sm:mx-5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            What&apos;s the basic item?
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-green-700 dark:text-green-400">
            This is the item your customer originally orders — like a single
            burger or a regular coffee. You&apos;ll pick the upgrade option in the
            next step.
          </p>
        </div>
      </div>

      {/* Item Grid */}
      <WizardItemGrid
        items={items}
        selectedItemId={selectedItemId}
        onSelect={onSelect}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify no lint errors**

Run: `npx eslint src/components/admin/wizard-step-source.tsx --no-error-on-unmatched-pattern`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/wizard-step-source.tsx
git commit -m "feat: add WizardStepSource component (Step 1 — pick basic item)"
```

---

### Task 3: Wizard Step 2 — Target Item Selection

**Files:**
- Create: `src/components/admin/wizard-step-target.tsx`

- [ ] **Step 1: Create the WizardStepTarget component**

Create `src/components/admin/wizard-step-target.tsx`:

```tsx
'use client'

import { Lightbulb, ShoppingBag } from 'lucide-react'
import { WizardItemGrid } from '@/components/admin/wizard-item-grid'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'
import type { PriceBadge } from '@/components/admin/wizard-item-grid'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface WizardStepTargetProps {
  items: MenuItemWithCategory[]
  sourceItem: MenuItemWithCategory
  selectedItemId: string | null
  onSelect: (itemId: string) => void
}

export function WizardStepTarget({
  items,
  sourceItem,
  selectedItemId,
  onSelect,
}: WizardStepTargetProps) {
  const getPriceBadge = (item: MenuItemWithCategory): PriceBadge | null => {
    const diff = item.price - sourceItem.price
    if (diff > 0) return { label: `+${formatPrice(diff)}`, variant: 'positive' }
    if (diff < 0) return { label: `${formatPrice(diff)}`, variant: 'negative' }
    return null
  }

  return (
    <div>
      {/* Pinned Source Item */}
      <div className="border-b bg-muted/30 px-4 py-3 sm:px-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Basic item selected
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-background p-2.5">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
            {sourceItem.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceItem.image_url}
                alt={sourceItem.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{sourceItem.name}</p>
            <p className="text-xs font-medium text-green-600">
              {formatPrice(sourceItem.price)}
            </p>
          </div>
          <span className="text-lg text-muted-foreground">→</span>
          <span className="text-xs font-semibold text-primary">
            suggest upgrading to...
          </span>
        </div>
      </div>

      {/* Explainer */}
      <div className="mx-4 mt-4 flex gap-3 rounded-lg bg-green-50 p-3.5 dark:bg-green-950/30 sm:mx-5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            Pick the upgrade
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-green-700 dark:text-green-400">
            Choose a higher-value item to suggest — like a meal combo instead of
            a single burger. The price difference is what motivates the upgrade.
          </p>
        </div>
      </div>

      {/* Item Grid with price badges */}
      <WizardItemGrid
        items={items}
        selectedItemId={selectedItemId}
        onSelect={onSelect}
        disabledItemId={sourceItem.id}
        disabledLabel="Already selected"
        getPriceBadge={getPriceBadge}
      />
    </div>
  )
}
```

- [ ] **Step 2: Handle negative price formatting**

The `formatPrice` utility formats positive numbers. For negative diffs, we need to show the minus sign. Check `src/lib/cart-utils.ts` for `formatPrice` behavior. If it doesn't handle negatives with a sign, update the badge logic in `wizard-step-target.tsx`:

Replace:
```tsx
if (diff < 0) return { label: `${formatPrice(diff)}`, variant: 'negative' }
```
With:
```tsx
if (diff < 0) return { label: `-${formatPrice(Math.abs(diff))}`, variant: 'negative' }
```

- [ ] **Step 3: Verify no lint errors**

Run: `npx eslint src/components/admin/wizard-step-target.tsx --no-error-on-unmatched-pattern`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/wizard-step-target.tsx
git commit -m "feat: add WizardStepTarget component (Step 2 — pick upgrade item)"
```

---

### Task 4: Wizard Step 3 — Customize & Preview

**Files:**
- Create: `src/components/admin/wizard-step-customize.tsx`

- [ ] **Step 1: Create the WizardStepCustomize component**

Create `src/components/admin/wizard-step-customize.tsx`:

```tsx
'use client'

import { Pencil, Eye, ShoppingBag } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface WizardStepCustomizeProps {
  sourceItem: MenuItemWithCategory
  targetItem: MenuItemWithCategory
  upgradeHeader: string
  sourceLabel: string
  targetLabel: string
  onUpgradeHeaderChange: (value: string) => void
  onSourceLabelChange: (value: string) => void
  onTargetLabelChange: (value: string) => void
}

function ItemImage({ item, size = 'md' }: { item: MenuItem; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'

  return (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-lg bg-muted`}>
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
    </div>
  )
}

export function WizardStepCustomize({
  sourceItem,
  targetItem,
  upgradeHeader,
  sourceLabel,
  targetLabel,
  onUpgradeHeaderChange,
  onSourceLabelChange,
  onTargetLabelChange,
}: WizardStepCustomizeProps) {
  const priceDiff = targetItem.price - sourceItem.price
  const displayHeader = upgradeHeader || `Upgrade your ${sourceItem.name}?`
  const displaySourceLabel = sourceLabel || 'Ala Carte'
  const displayTargetLabel = targetLabel || 'Meal'

  return (
    <div className="space-y-0">
      {/* Pair Summary */}
      <div className="border-b bg-muted/30 px-4 py-4 sm:px-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your upgrade pair
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {/* Source */}
          <div className="flex flex-1 items-center gap-3 rounded-lg border bg-background p-3">
            <ItemImage item={sourceItem} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                Basic
              </p>
              <p className="text-sm font-semibold truncate">{sourceItem.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatPrice(sourceItem.price)}
              </p>
            </div>
          </div>

          {/* Arrow + Price Diff */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span className="text-xl text-primary">→</span>
            {priceDiff > 0 && (
              <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
                +{formatPrice(priceDiff)}
              </span>
            )}
          </div>

          {/* Target */}
          <div className="flex flex-1 items-center gap-3 rounded-lg border-2 border-primary bg-background p-3">
            <ItemImage item={targetItem} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-primary">
                Upgrade
              </p>
              <p className="text-sm font-semibold truncate">{targetItem.name}</p>
              <p className="text-xs font-medium text-green-600">
                {formatPrice(targetItem.price)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Customize Labels */}
      <div className="px-4 py-5 sm:px-5">
        <div className="mb-4 flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Customize labels{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wiz-header" className="text-xs">
              Header text
            </Label>
            <Input
              id="wiz-header"
              placeholder="e.g. Want to make it a meal?"
              value={upgradeHeader}
              onChange={(e) => onUpgradeHeaderChange(e.target.value)}
              maxLength={100}
            />
            <p className="text-[11px] text-muted-foreground">
              Shown as the title when suggesting the upgrade
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wiz-source-label" className="text-xs">
                Basic item label
              </Label>
              <Input
                id="wiz-source-label"
                placeholder="e.g. Ala Carte"
                value={sourceLabel}
                onChange={(e) => onSourceLabelChange(e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-target-label" className="text-xs">
                Upgrade item label
              </Label>
              <Input
                id="wiz-target-label"
                placeholder="e.g. Meal"
                value={targetLabel}
                onChange={(e) => onTargetLabelChange(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border sm:mx-5" />

      {/* Live Preview */}
      <div className="px-4 py-5 sm:px-5">
        <div className="mb-4 flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Customer preview</h3>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Live
          </span>
        </div>

        {/* Simulated Customer Modal */}
        <div className="overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-background">
          <div className="px-5 pt-5 pb-3 text-center">
            <p className="text-lg font-bold">{displayHeader}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 px-5 pb-5">
            {/* Source Preview Card */}
            <div className="overflow-hidden rounded-xl border-2 border-muted text-center">
              <div className="aspect-[4/3] w-full bg-muted">
                {sourceItem.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sourceItem.image_url}
                    alt={sourceItem.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <Badge variant="secondary" className="mb-1.5 text-[10px]">
                  {displaySourceLabel}
                </Badge>
                <p className="text-xs font-semibold truncate">{sourceItem.name}</p>
                <p className="mt-0.5 text-sm font-bold">
                  {formatPrice(sourceItem.price)}
                </p>
              </div>
            </div>

            {/* Target Preview Card */}
            <div className="relative overflow-hidden rounded-xl border-2 border-green-500 text-center shadow-sm">
              {priceDiff > 0 && (
                <div className="absolute right-2 top-2 z-10 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  +{formatPrice(priceDiff)}
                </div>
              )}
              <div className="aspect-[4/3] w-full bg-muted">
                {targetItem.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={targetItem.image_url}
                    alt={targetItem.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <Badge className="mb-1.5 bg-green-500 text-[10px] hover:bg-green-500">
                  {displayTargetLabel}
                </Badge>
                <p className="text-xs font-semibold truncate">{targetItem.name}</p>
                <p className="mt-0.5 text-sm font-bold">
                  {formatPrice(targetItem.price)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no lint errors**

Run: `npx eslint src/components/admin/wizard-step-customize.tsx --no-error-on-unmatched-pattern`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/wizard-step-customize.tsx
git commit -m "feat: add WizardStepCustomize component (Step 3 — labels + preview)"
```

---

### Task 5: Wizard Shell Component

**Files:**
- Create: `src/components/admin/upgrade-pair-wizard.tsx`

The shell manages step state, progress bar, navigation, and submission.

- [ ] **Step 1: Create the UpgradePairWizard component**

Create `src/components/admin/upgrade-pair-wizard.tsx`:

```tsx
'use client'

import { useState, useMemo, useTransition } from 'react'
import { X, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WizardStepSource } from '@/components/admin/wizard-step-source'
import { WizardStepTarget } from '@/components/admin/wizard-step-target'
import { WizardStepCustomize } from '@/components/admin/wizard-step-customize'
import {
  createUpsellPairAction,
  deleteUpsellPairAction,
} from '@/app/actions/menu-engineering'
import { formatPrice } from '@/lib/cart-utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { MenuItem, UpsellPairWithItems } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface UpgradePairWizardProps {
  menuItems: MenuItemWithCategory[]
  tenantId: string
  tenantSlug: string
  existingPair?: UpsellPairWithItems | null
  onClose: () => void
}

const STEPS = [
  { label: 'Basic Item', shortLabel: '1' },
  { label: 'Upgrade Item', shortLabel: '2' },
  { label: 'Customize', shortLabel: '3' },
] as const

export function UpgradePairWizard({
  menuItems,
  tenantId,
  tenantSlug,
  existingPair,
  onClose,
}: UpgradePairWizardProps) {
  const isEditing = !!existingPair
  const [currentStep, setCurrentStep] = useState(0)
  const [sourceItemId, setSourceItemId] = useState<string | null>(
    existingPair?.source_item_id ?? null
  )
  const [targetItemId, setTargetItemId] = useState<string | null>(
    existingPair?.target_item_id ?? null
  )
  const [upgradeHeader, setUpgradeHeader] = useState(
    existingPair?.upgrade_header ?? ''
  )
  const [sourceLabel, setSourceLabel] = useState(
    existingPair?.source_label ?? ''
  )
  const [targetLabel, setTargetLabel] = useState(
    existingPair?.target_label ?? ''
  )
  const [isPending, startTransition] = useTransition()

  const availableItems = useMemo(
    () => menuItems.filter((item) => item.is_available),
    [menuItems]
  )

  const sourceItem = useMemo(
    () => availableItems.find((item) => item.id === sourceItemId) ?? null,
    [availableItems, sourceItemId]
  )
  const targetItem = useMemo(
    () => availableItems.find((item) => item.id === targetItemId) ?? null,
    [availableItems, targetItemId]
  )

  const canGoNext =
    (currentStep === 0 && sourceItemId !== null) ||
    (currentStep === 1 && targetItemId !== null) ||
    currentStep === 2

  const handleNext = () => {
    if (currentStep < 2) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const handleSubmit = () => {
    if (!sourceItemId || !targetItemId) return

    startTransition(async () => {
      // For edit: delete old pair then create new one
      if (isEditing && existingPair) {
        const deleteResult = await deleteUpsellPairAction(
          existingPair.id,
          tenantId,
          tenantSlug
        )
        if (!deleteResult.success) {
          toast.error(deleteResult.error || 'Failed to update pair')
          return
        }
      }

      const result = await createUpsellPairAction(tenantId, tenantSlug, {
        source_item_id: sourceItemId,
        target_item_id: targetItemId,
        pair_type: 'upgrade',
        upgrade_header: upgradeHeader || undefined,
        source_label: sourceLabel || undefined,
        target_label: targetLabel || undefined,
      })

      if (result.success) {
        toast.success(isEditing ? 'Upgrade pair updated' : 'Upgrade pair created')
        onClose()
      } else {
        toast.error(result.error || 'Failed to create pair')
      }
    })
  }

  // Footer selected item summary
  const footerSummary = () => {
    if (currentStep === 0 && sourceItem) {
      return (
        <span className="text-xs text-muted-foreground">
          Selected:{' '}
          <strong className="text-primary">{sourceItem.name} ({formatPrice(sourceItem.price)})</strong>
        </span>
      )
    }
    if (currentStep === 1 && targetItem && sourceItem) {
      const diff = targetItem.price - sourceItem.price
      return (
        <span className="text-xs text-muted-foreground">
          Upgrade:{' '}
          <strong className="text-primary">{targetItem.name} ({formatPrice(targetItem.price)})</strong>
          {diff > 0 && (
            <span className="ml-1 font-semibold text-green-600">
              +{formatPrice(diff)}/order
            </span>
          )}
        </span>
      )
    }
    return null
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* Progress Bar */}
      <div className="flex items-center gap-0 border-b bg-gradient-to-r from-primary/5 to-primary/[0.02] px-4 py-3 sm:px-5">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStep
          const isActive = i === currentStep
          return (
            <div key={step.label} className="flex flex-1 items-center gap-0">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    isCompleted && 'bg-green-500 text-white',
                    isActive && 'bg-primary text-primary-foreground',
                    !isCompleted && !isActive && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    'hidden text-xs font-medium sm:inline',
                    isCompleted && 'text-green-600',
                    isActive && 'text-primary',
                    !isCompleted && !isActive && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-3 h-0.5 flex-1 rounded-full',
                    i < currentStep ? 'bg-green-500' : i === currentStep ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </div>
          )
        })}

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="ml-2 h-7 w-7 shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Step Content */}
      <div className="max-h-[60vh] overflow-y-auto">
        {currentStep === 0 && (
          <WizardStepSource
            items={availableItems}
            selectedItemId={sourceItemId}
            onSelect={setSourceItemId}
          />
        )}
        {currentStep === 1 && sourceItem && (
          <WizardStepTarget
            items={availableItems}
            sourceItem={sourceItem}
            selectedItemId={targetItemId}
            onSelect={setTargetItemId}
          />
        )}
        {currentStep === 2 && sourceItem && targetItem && (
          <WizardStepCustomize
            sourceItem={sourceItem}
            targetItem={targetItem}
            upgradeHeader={upgradeHeader}
            sourceLabel={sourceLabel}
            targetLabel={targetLabel}
            onUpgradeHeaderChange={setUpgradeHeader}
            onSourceLabelChange={setSourceLabel}
            onTargetLabelChange={setTargetLabel}
          />
        )}
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 sm:px-5">
        <Button
          variant="outline"
          size="sm"
          onClick={currentStep === 0 ? onClose : handleBack}
          disabled={isPending}
        >
          {currentStep === 0 ? (
            'Cancel'
          ) : (
            <>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </>
          )}
        </Button>

        <div className="hidden sm:block">{footerSummary()}</div>

        {currentStep < 2 ? (
          <Button size="sm" onClick={handleNext} disabled={!canGoNext}>
            Next
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isEditing ? 'Save Changes' : 'Create Upgrade Pair'}
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no lint errors**

Run: `npx eslint src/components/admin/upgrade-pair-wizard.tsx --no-error-on-unmatched-pattern`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/upgrade-pair-wizard.tsx
git commit -m "feat: add UpgradePairWizard shell (step state, progress bar, navigation, submission)"
```

---

### Task 6: Integrate Wizard into UpsellPairsTab

**Files:**
- Modify: `src/components/admin/upsell-pairs-tab.tsx`

Replace the old inline form and SmartUpgradePanel with the wizard. Keep the existing pairs list, search, and delete. Add edit button to each pair row.

- [ ] **Step 1: Rewrite upsell-pairs-tab.tsx**

Replace the entire contents of `src/components/admin/upsell-pairs-tab.tsx` with:

```tsx
'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  Trash2,
  Plus,
  ArrowRight,
  Search,
  ShoppingBag,
  Utensils,
  Pencil,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { deleteUpsellPairAction } from '@/app/actions/menu-engineering'
import type { MenuItem, UpsellPairWithItems } from '@/types/database'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import { UpgradePairWizard } from '@/components/admin/upgrade-pair-wizard'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface UpsellPairsTabProps {
  menuItems: MenuItemWithCategory[]
  upsellPairs: UpsellPairWithItems[]
  tenantId: string
  tenantSlug: string
}

export function UpsellPairsTab({
  menuItems,
  upsellPairs,
  tenantId,
  tenantSlug,
}: UpsellPairsTabProps) {
  const [isPending, startTransition] = useTransition()
  const [pairSearchQuery, setPairSearchQuery] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingPair, setEditingPair] = useState<UpsellPairWithItems | null>(null)

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

  const handleOpenWizard = (pair?: UpsellPairWithItems) => {
    setEditingPair(pair ?? null)
    setWizardOpen(true)
  }

  const handleCloseWizard = () => {
    setWizardOpen(false)
    setEditingPair(null)
  }

  const upgradePairs = useMemo(
    () => upsellPairs.filter((p) => p.pair_type === 'upgrade'),
    [upsellPairs]
  )

  const filteredPairs = useMemo(() => {
    if (!pairSearchQuery) return upgradePairs
    const q = pairSearchQuery.toLowerCase()
    return upgradePairs.filter(
      (p) =>
        p.source_item?.name.toLowerCase().includes(q) ||
        p.target_item?.name.toLowerCase().includes(q)
    )
  }, [upgradePairs, pairSearchQuery])

  // Show wizard instead of the list when open
  if (wizardOpen) {
    return (
      <UpgradePairWizard
        menuItems={menuItems}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        existingPair={editingPair}
        onClose={handleCloseWizard}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Create Button */}
      <Button onClick={() => handleOpenWizard()} className="w-full sm:w-auto">
        <Plus className="mr-2 h-4 w-4" />
        Create Upgrade Pair
      </Button>

      {/* Existing Pairs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Existing Upgrade Pairs</CardTitle>
              <CardDescription className="mt-1">
                {upgradePairs.length} upgrade pair{upgradePairs.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>

            {upgradePairs.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search pairs..."
                  value={pairSearchQuery}
                  onChange={(e) => setPairSearchQuery(e.target.value)}
                  className="h-8 w-48 pl-8 text-xs"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {upgradePairs.length === 0 ? (
            <div className="py-12 text-center">
              <Utensils className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No upgrade pairs configured yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create your first upgrade pair to start driving more revenue per order.
              </p>
            </div>
          ) : filteredPairs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No pairs match your filter.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredPairs.map((pair) => {
                const priceDiff =
                  pair.source_item && pair.target_item
                    ? pair.target_item.price - pair.source_item.price
                    : null

                return (
                  <div
                    key={pair.id}
                    className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.02] p-3 transition-colors"
                  >
                    {/* Source Item */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {pair.source_item?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pair.source_item.image_url}
                            alt={pair.source_item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {pair.source_item?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pair.source_item ? formatPrice(pair.source_item.price) : ''}
                        </p>
                      </div>
                    </div>

                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                    {/* Target Item */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {pair.target_item?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pair.target_item.image_url}
                            alt={pair.target_item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {pair.target_item?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pair.target_item ? formatPrice(pair.target_item.price) : ''}
                        </p>
                      </div>
                    </div>

                    {/* Labels + Price Diff */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="default">upgrade</Badge>
                      {(pair.source_label || pair.target_label) && (
                        <span className="text-[10px] text-muted-foreground">
                          {pair.source_label || 'Current'} &rarr;{' '}
                          {pair.target_label || 'Upgrade'}
                        </span>
                      )}
                      {priceDiff !== null && priceDiff > 0 && (
                        <span className="text-[10px] font-semibold text-green-600">
                          +{formatPrice(priceDiff)}
                        </span>
                      )}
                    </div>

                    {/* Edit */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => handleOpenWizard(pair)}
                      disabled={isPending}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Delete */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => handleDeletePair(pair.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify no lint errors**

Run: `npx eslint src/components/admin/upsell-pairs-tab.tsx --no-error-on-unmatched-pattern`
Expected: No errors.

- [ ] **Step 3: Verify SmartUpgradePanel is no longer imported anywhere**

Run: `grep -r "SmartUpgradePanel\|smart-upgrade-panel" src/`
Expected: No results (the only consumer was `upsell-pairs-tab.tsx` which we just rewrote).

If the file `src/components/admin/smart-upgrade-panel.tsx` is not imported anywhere else, delete it:
```bash
rm src/components/admin/smart-upgrade-panel.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/upsell-pairs-tab.tsx
git rm src/components/admin/smart-upgrade-panel.tsx 2>/dev/null; git add -A src/components/admin/smart-upgrade-panel.tsx 2>/dev/null
git commit -m "feat: integrate upgrade pair wizard into UpsellPairsTab, remove old form + SmartUpgradePanel"
```

---

### Task 7: Lint Check & Build Verification

**Files:**
- All new/modified files

- [ ] **Step 1: Run lint on all new files**

Run:
```bash
npx eslint src/components/admin/wizard-item-grid.tsx src/components/admin/wizard-step-source.tsx src/components/admin/wizard-step-target.tsx src/components/admin/wizard-step-customize.tsx src/components/admin/upgrade-pair-wizard.tsx src/components/admin/upsell-pairs-tab.tsx --no-error-on-unmatched-pattern
```
Expected: No errors.

- [ ] **Step 2: Run full project lint**

Run: `npm run lint`
Expected: No errors. If there are pre-existing errors (known: `mcp/src/index.ts`, `menu-engineering.ts:92`), only check that no NEW errors were introduced.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds. Watch for:
- TypeScript errors in the new wizard files
- Missing imports
- Type mismatches between components

- [ ] **Step 4: Fix any issues found and commit**

If there are issues, fix them and commit:
```bash
git add -A
git commit -m "fix: resolve lint/build issues in upgrade pair wizard"
```
