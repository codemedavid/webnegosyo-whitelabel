'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, SearchX, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { toggleAvailabilityAction } from '@/app/actions/menu-items'
import { describeActionError } from '@/components/admin/server-action-safety'
import type { MenuItem, Category, OutletMenuOverride } from '@/types/database'
import {
  buildOutletMenuIndex,
  describeBranchSummary,
  summarizeItemAcrossBranches,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'
import {
  countMenuItemsByStatus,
  EMPTY_MENU_FILTERS,
  filterMenuItems,
  hasActiveMenuFilters,
  type MenuListFilters,
} from '@/lib/menu-list-filters'
import { groupMenuItemsByCategory } from '@/lib/menu-list-groups'
import { MenuListToolbar } from '@/components/admin/menu-list-toolbar'
import { MenuItemRow } from '@/components/admin/menu-item-row'

interface MenuItemsListProps {
  items: MenuItem[]
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
  outlets = [],
  menuOverrides = [],
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
  const router = useRouter()
  const [filters, setFilters] = useState<MenuListFilters>(EMPTY_MENU_FILTERS)
  const [togglingId, setTogglingId] = useState<string | null>(null)
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

  const handleToggleAvailability = async (item: MenuItem, next: boolean) => {
    setTogglingId(item.id)
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
        toast.success(`${item.name} is now ${next ? 'available' : 'out of stock'}`)
        router.refresh()
      } else {
        revert()
        toast.error(result.error || 'Could not update the dish. Please try again.')
      }
    } catch (error) {
      revert()
      toast.error(describeActionError(error))
    } finally {
      setTogglingId(null)
    }
  }

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

  return (
    <div className="space-y-5">
      <MenuListToolbar filters={filters} counts={counts} categories={categories} onChange={setFilters} />

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
            <h2 className="flex items-baseline gap-2 px-1 text-sm font-semibold">
              {group.name}
              <span className="font-normal text-muted-foreground tabular-nums">{group.items.length}</span>
            </h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {group.items.map((item) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  tenantSlug={tenantSlug}
                  isAvailable={pendingAvailability[item.id] ?? item.is_available}
                  branchLabel={outlets.length > 0
                    ? describeBranchSummary(summarizeItemAcrossBranches(item, outlets, branchIndex))
                    : null}
                  isRecipeMissing={inventoryEnabled && linkedRecipeIds !== null && !linkedRecipeIds.has(item.id)}
                  isToggling={togglingId === item.id}
                  onToggleAvailability={(next) => void handleToggleAvailability(item, next)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
