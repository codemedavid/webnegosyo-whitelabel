'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowUpDown, Plus, SearchX, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { toggleAvailabilityAction } from '@/app/actions/menu-items'
import { describeActionError } from '@/components/admin/server-action-safety'
import type { Category, OutletMenuOverride } from '@/types/database'
import type { AdminMenuListItem } from '@/lib/queries/admin-menu-list'
import {
  buildOutletMenuIndex,
  describeBranchSummary,
  summarizeItemAcrossBranches,
  type BranchSummaryLabel,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'
import {
  countMenuItemsByStatus,
  EMPTY_MENU_FILTERS,
  filterMenuItems,
  hasActiveMenuFilters,
  type MenuListFilters,
} from '@/lib/menu-list-filters'
import { groupMenuItemsByCategory, OTHER_GROUP_KEY } from '@/lib/menu-list-groups'
import { MenuListToolbar } from '@/components/admin/menu-list-toolbar'
import { MenuItemRow } from '@/components/admin/menu-item-row'

// dnd-kit is only needed once the owner taps "Arrange order" — keep it out of
// the bundle every menu visit downloads.
const MenuArrangeList = dynamic(
  () => import('@/components/admin/menu-arrange-list').then((mod) => mod.MenuArrangeList),
  { loading: () => <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> }
)

type ToggleAvailability = (item: AdminMenuListItem, next: boolean) => void

/**
 * One row, memoised: typing in the search box re-renders the list, and with
 * stable props (the per-row closure is built here, from a stable handler) the
 * rows whose dish did not change are skipped instead of re-rendered.
 */
const ListedMenuItemRow = memo(function ListedMenuItemRow({
  item,
  onToggle,
  ...rowProps
}: {
  item: AdminMenuListItem
  tenantSlug: string
  isAvailable: boolean
  branchLabel: BranchSummaryLabel | null
  isRecipeMissing: boolean
  isToggling: boolean
  onToggle: ToggleAvailability
}) {
  const handleToggle = useCallback((next: boolean) => onToggle(item, next), [onToggle, item])
  return <MenuItemRow item={item} onToggleAvailability={handleToggle} {...rowProps} />
})

const NO_OUTLETS: readonly { id: string; name: string }[] = []
const NO_OVERRIDES: readonly OutletMenuOverride[] = []

interface MenuItemsListProps {
  /** The lean list read (`listAdminMenuItems`) — no variation/add-on JSON. */
  items: readonly AdminMenuListItem[]
  categories: Category[]
  tenantSlug: string
  tenantId: string
  /** Empty for a store without branches; the badge then never renders. */
  outlets?: readonly { id: string; name: string }[]
  menuOverrides?: readonly OutletMenuOverride[]
  /** True when this tenant tracks inventory; the recipe badge is theirs alone. */
  inventoryEnabled?: boolean
  /**
   * Ids of dishes whose sales actually deduct stock. `null` means the read
   * failed — the verdict is withheld rather than accusing every dish, because
   * an unknown must never render as "not linked".
   */
  recipeLinkedItemIds?: readonly string[] | null
}

export function MenuItemsList({
  items,
  categories,
  tenantSlug,
  tenantId,
  outlets = NO_OUTLETS,
  menuOverrides = NO_OVERRIDES,
  inventoryEnabled = false,
  recipeLinkedItemIds = null,
}: MenuItemsListProps) {
  // A Set for the per-row lookup; the array form only exists to cross the
  // server boundary.
  const linkedRecipeIds = useMemo(
    () => (recipeLinkedItemIds === null ? null : new Set(recipeLinkedItemIds)),
    [recipeLinkedItemIds]
  )
  // One index for the whole list rather than one lookup per row: the owner's
  // "is this the same everywhere" answer comes from the same resolution the
  // customer's price does, so the badge can never disagree with the storefront.
  const branchIndex = useMemo(
    () => buildOutletMenuIndex(menuOverrides as unknown as OutletMenuOverrideRow[]),
    [menuOverrides]
  )
  const [filters, setFilters] = useState<MenuListFilters>(EMPTY_MENU_FILTERS)
  /**
   * Every dish whose switch is mid-save. A set, not one id: a second dish
   * flipped while the first is saving must not re-enable the first's switch
   * (a tap there would race its own pending write).
   */
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [isArranging, setIsArranging] = useState(false)
  /**
   * Switch positions the owner set that the server has not echoed back yet.
   * The switch flips on tap rather than after the round trip; the entries are
   * dropped whenever fresh items arrive, which is when the refresh lands.
   */
  const [pendingAvailability, setPendingAvailability] = useState<Record<string, boolean>>({})
  const [itemsSeen, setItemsSeen] = useState(items)
  if (itemsSeen !== items) {
    setItemsSeen(items)
    setPendingAvailability({})
  }

  const counts = useMemo(() => countMenuItemsByStatus(items), [items])
  const filteredItems = useMemo(() => filterMenuItems(items, filters), [items, filters])
  const groups = useMemo(() => groupMenuItemsByCategory(filteredItems, categories), [filteredItems, categories])
  const isFiltered = hasActiveMenuFilters(filters)
  // Arranging always shows every dish: an order set over a filtered subset
  // would move dishes the merchant cannot see.
  const arrangeGroups = useMemo(
    () => groupMenuItemsByCategory(items, categories).filter((group) => group.key !== OTHER_GROUP_KEY),
    [items, categories]
  )

  // Branch badges depend on the dishes and the branch data only — computed once
  // per fresh read, not once per row on every search keystroke.
  const branchLabels = useMemo(() => {
    const labels = new Map<string, BranchSummaryLabel>()
    if (outlets.length === 0) return labels
    for (const item of items) {
      const label = describeBranchSummary(summarizeItemAcrossBranches(item, outlets, branchIndex))
      if (label) labels.set(item.id, label)
    }
    return labels
  }, [items, outlets, branchIndex])

  // Stable across renders (only setters and stable props inside), so memoised
  // rows keep their props identity.
  const handleToggleAvailability = useCallback(async (item: AdminMenuListItem, next: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(item.id))
    setPendingAvailability((prev) => ({ ...prev, [item.id]: next }))
    const revert = () =>
      setPendingAvailability((prev) => {
        const rest = { ...prev }
        delete rest[item.id]
        return rest
      })
    try {
      const result = await toggleAvailabilityAction(item.id, tenantId, tenantSlug, next)
      if (result.success) {
        // No router.refresh(): the action's revalidatePath already returns this
        // page's fresh render with its response (a refresh rendered it twice),
        // and the new `items` it brings clears the pending switch above.
        toast.success(`${item.name} is now ${next ? 'available' : 'out of stock'}`)
      } else {
        revert()
        toast.error(result.error || 'Could not update the dish. Please try again.')
      }
    } catch (error) {
      revert()
      toast.error(describeActionError(error))
    } finally {
      setTogglingIds((prev) => {
        const rest = new Set(prev)
        rest.delete(item.id)
        return rest
      })
    }
  }, [tenantId, tenantSlug])
  const handleToggle = useCallback<ToggleAvailability>(
    (item, next) => void handleToggleAvailability(item, next),
    [handleToggleAvailability]
  )

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-16 text-center">
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
        </span>
        <h3 className="text-lg font-semibold">Add your first dish</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          A photo, a name and a price is all it takes. It shows on your menu right away.
        </p>
        <Link href={`/${tenantSlug}/admin/menu/new`} className="mt-5">
          <Button className="h-11 px-6"><Plus className="mr-2 h-4 w-4" />Add dish</Button>
        </Link>
      </div>
    )
  }

  if (isArranging) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/40 p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Arrange dishes</h2>
            <p className="text-sm text-muted-foreground">
              Drag a dish or use the arrows. Your online menu and your POS both follow this order. Changes save as you go.
            </p>
          </div>
          <Button className="h-11 shrink-0 px-5" onClick={() => setIsArranging(false)}>
            Done
          </Button>
        </div>
        <MenuArrangeList groups={arrangeGroups} tenantId={tenantId} tenantSlug={tenantSlug} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <MenuListToolbar
        filters={filters}
        counts={counts}
        categories={categories}
        onChange={setFilters}
        actions={
          <Button variant="outline" className="h-9 shrink-0" onClick={() => setIsArranging(true)}>
            <ArrowUpDown className="mr-1.5 h-4 w-4" />
            Arrange order
          </Button>
        }
      />

      {isFiltered && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {filteredItems.length} of {items.length} dish{items.length === 1 ? '' : 'es'}
        </p>
      )}

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
          <SearchX className="mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="text-base font-semibold">No dishes match these filters</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Try a different search, category, or status.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilters(EMPTY_MENU_FILTERS)}>
            Clear filters
          </Button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.name} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                {group.name}
                <span className="font-normal text-muted-foreground tabular-nums">{group.items.length}</span>
              </h2>
              {group.key !== OTHER_GROUP_KEY && (
                <Link
                  href={`/${tenantSlug}/admin/menu/new?category=${group.key}`}
                  aria-label={`Add a dish to ${group.name}`}
                  className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add
                </Link>
              )}
            </div>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {group.items.map((item) => (
                <ListedMenuItemRow
                  key={item.id}
                  item={item}
                  tenantSlug={tenantSlug}
                  isAvailable={pendingAvailability[item.id] ?? item.is_available}
                  branchLabel={branchLabels.get(item.id) ?? null}
                  isRecipeMissing={inventoryEnabled && linkedRecipeIds !== null && !linkedRecipeIds.has(item.id)}
                  isToggling={togglingIds.has(item.id)}
                  onToggle={handleToggle}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
