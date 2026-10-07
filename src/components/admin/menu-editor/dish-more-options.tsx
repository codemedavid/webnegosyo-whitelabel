'use client'

/**
 * Everything on a dish most owners never touch, as one list of closed rows.
 * Each row names its current state ("On", "Not linked") so nothing important
 * hides behind a collapsed section, and each renders only when the store has
 * the feature switched on.
 */

import type { ReactNode } from 'react'
import { CalendarDays, CookingPot, Sparkles, Wallet } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BcgClassification } from '@/types/database'
import type { DraftAllocation } from '@/lib/presell/allocation-draft'
import { SafeConvexProvider } from '@/components/shared/safe-convex-provider'
import { ProductCostField } from '@/components/admin/product-cost-field'
import { ProductCostFieldConvex } from '@/components/admin/product-cost-field-convex'
import { ProductMiniPerformance } from '@/components/admin/product-mini-performance'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { TagManager } from '@/components/admin/tag-manager'
import { MenuItemPresellSection, SettingSwitch } from '@/components/admin/menu-item-presell-section'
import { OptionalSection, OptionalSectionList } from '@/components/admin/menu-editor/editor-section'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'

const BCG_CHOICES: readonly { value: BcgClassification; label: string }[] = [
  { value: 'unclassified', label: 'Not set' },
  { value: 'star', label: 'Star — popular and profitable' },
  { value: 'plowhorse', label: 'Plowhorse — popular, lower profit' },
  { value: 'puzzle', label: 'Puzzle — profitable, ordered less' },
  { value: 'dog', label: 'Dog — ordered less, lower profit' },
]

export interface DishBoosts {
  show_in_checkout_upsell: boolean
  bcg_classification: BcgClassification
  badge_text: string
}

interface DishMoreOptionsProps {
  itemId?: string
  tenantId: string
  tenantSlug: string
  convexUrl?: string
  price: number
  discountedPrice?: number
  inventoryEnabled: boolean
  /** Undefined when unknown; the row then states no verdict. */
  hasRecipe?: boolean
  onRecipeSaved: () => void
  presell?: {
    isEnabled: boolean
    onToggle: (checked: boolean) => void
    savedAllocations: DraftAllocation[]
    draft: DraftAllocation[]
    onDraftChange: (next: DraftAllocation[]) => void
    loadError?: string
  }
  menuEngineeringEnabled: boolean
  boosts: DishBoosts
  onBoostsChange: (next: DishBoosts) => void
  /** Per-branch prices and stock; rendered by the page because it saves on its own. */
  branchesSlot?: ReactNode
}

export function DishMoreOptions(props: DishMoreOptionsProps) {
  const { inventoryEnabled, presell, branchesSlot } = props
  return (
    <OptionalSectionList id={DISH_SECTION_IDS.more} title="More options">
      <CostRow {...props} />
      {inventoryEnabled && <IngredientsRow {...props} />}
      {presell && <PresellRow presell={presell} />}
      <BoostsRow {...props} />
      {branchesSlot}
    </OptionalSectionList>
  )
}

function CostRow({ itemId, convexUrl, price, discountedPrice, inventoryEnabled }: DishMoreOptionsProps) {
  const canSave = Boolean(convexUrl && itemId)
  return (
    <OptionalSection
      icon={Wallet}
      title={canSave ? 'Cost & profit' : 'Profit calculator'}
      hint={canSave ? 'What it costs you to make, and what you keep' : 'Try a cost to see your margin'}
      summary={canSave ? undefined : 'Not saved'}
    >
      {canSave && convexUrl && itemId ? (
        <SafeConvexProvider url={convexUrl}>
          {/* Convex-connected: persists the cost price so BCG classification can work. */}
          <ProductCostFieldConvex menuItemId={itemId} currentPrice={price} discountedPrice={discountedPrice} />
          <ProductMiniPerformance menuItemId={itemId} />
        </SafeConvexProvider>
      ) : (
        <>
          {/*
            This store has nowhere to keep a typed cost (it lives in Convex, and
            the platform menu has no cost column), so say so instead of letting
            the owner think it was saved. Real cost comes from the recipe.
          */}
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {inventoryEnabled
              ? 'This is a quick calculator and is not saved. For a cost that stays, add the dish’s ingredients — its margin then shows under Pricing.'
              : 'This is a quick calculator and is not saved.'}
          </p>
          <ProductCostField menuItemId={itemId} currentPrice={price} discountedPrice={discountedPrice} />
        </>
      )}
    </OptionalSection>
  )
}

function IngredientsRow({ itemId, tenantId, tenantSlug, hasRecipe, onRecipeSaved }: DishMoreOptionsProps) {
  const summary = !itemId ? 'After saving' : hasRecipe === undefined ? undefined : hasRecipe ? 'Linked' : 'Not linked'
  return (
    <OptionalSection
      icon={CookingPot}
      title="Ingredients"
      hint="Deduct stock from your inventory when this sells"
      summary={summary}
      summaryTone={hasRecipe ? 'good' : itemId && hasRecipe === false ? 'warning' : 'muted'}
    >
      {itemId ? (
        <RecipeEditor
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          target={{ type: 'menu_item', menuItemId: itemId }}
          label="Ingredients used per order"
          onSaved={onRecipeSaved}
        />
      ) : (
        // A recipe needs an item id to attach to, so a brand-new dish cannot
        // have one yet — say so rather than render nothing.
        <p className="text-sm text-muted-foreground">
          Save the dish first. You&apos;ll be asked to add its ingredients right after. Until then,
          selling it won&apos;t deduct any stock.
        </p>
      )}
    </OptionalSection>
  )
}

function PresellRow({ presell }: { presell: NonNullable<DishMoreOptionsProps['presell']> }) {
  const dateCount = presell.draft.length
  const summary = presell.isEnabled
    ? `On · ${dateCount} date${dateCount === 1 ? '' : 's'}`
    : 'Off'
  return (
    <OptionalSection
      icon={CalendarDays}
      title="Pre-order dates"
      hint="Sell a set amount per pickup date"
      summary={summary}
      summaryTone={presell.isEnabled ? 'good' : 'muted'}
    >
      <MenuItemPresellSection
        isEnabled={presell.isEnabled}
        onToggle={presell.onToggle}
        savedAllocations={presell.savedAllocations}
        draft={presell.draft}
        onDraftChange={presell.onDraftChange}
        loadError={presell.loadError}
      />
    </OptionalSection>
  )
}

function describeBoosts(boosts: DishBoosts, isBadgeShown: boolean): string {
  const parts: string[] = []
  if (isBadgeShown && boosts.badge_text.trim()) parts.push(`“${boosts.badge_text.trim()}”`)
  if (boosts.show_in_checkout_upsell) parts.push('At checkout')
  return parts.length > 0 ? parts.join(' · ') : 'Off'
}

function BoostsRow({ itemId, tenantId, tenantSlug, menuEngineeringEnabled, boosts, onBoostsChange }: DishMoreOptionsProps) {
  const update = <K extends keyof DishBoosts>(field: K, value: DishBoosts[K]) =>
    onBoostsChange({ ...boosts, [field]: value })
  const summary = describeBoosts(boosts, menuEngineeringEnabled)

  return (
    <OptionalSection
      icon={Sparkles}
      title="Sell more"
      hint={menuEngineeringEnabled ? 'Suggest it at checkout, or add a label like Best seller' : 'Suggest it at checkout'}
      summary={summary}
      summaryTone={summary === 'Off' ? 'muted' : 'good'}
    >
      <div className="rounded-lg border bg-background">
        <SettingSwitch
          id="show_in_checkout_upsell"
          label="Suggest at checkout"
          description="Offer it on the “Before you go” screen."
          checked={boosts.show_in_checkout_upsell}
          onCheckedChange={(checked) => update('show_in_checkout_upsell', checked)}
        />
      </div>

      {menuEngineeringEnabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="badge_text">Label on the dish</Label>
              <Input
                id="badge_text"
                value={boosts.badge_text}
                onChange={(e) => update('badge_text', e.target.value)}
                placeholder="e.g. Best seller, New"
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">Shows as a small tag on the menu card.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bcg_classification">Menu performance group</Label>
              <Select
                value={boosts.bcg_classification}
                onValueChange={(value) => update('bcg_classification', value as BcgClassification)}
              >
                <SelectTrigger id="bcg_classification" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BCG_CHOICES.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used by Menu Engineering to pick what to suggest.</p>
            </div>
          </div>
          <TagManager itemId={itemId ?? null} tenantId={tenantId} tenantSlug={tenantSlug} />
        </>
      )}
    </OptionalSection>
  )
}
