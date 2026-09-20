'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteMenuItemAction, toggleAvailabilityAction } from '@/app/actions/menu-items'
import { describeActionError } from '@/components/admin/server-action-safety'
import { toast } from 'sonner'
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
import { MenuListToolbar } from '@/components/admin/menu-list-toolbar'
import { MenuItemCard } from '@/components/admin/menu-item-card'

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
  // A Set for the per-card lookup; the array form only exists to cross the
  // server boundary.
  const linkedRecipeIds = useMemo(
    () => (recipeLinkedItemIds === null ? null : new Set(recipeLinkedItemIds)),
    [recipeLinkedItemIds]
  )
  // One index for the whole grid rather than one lookup per card: the owner's
  // "is this the same everywhere" answer comes from the same resolution the
  // customer's price does, so the badge can never disagree with the storefront.
  const branchIndex = useMemo(
    () => buildOutletMenuIndex(menuOverrides as unknown as OutletMenuOverrideRow[]),
    [menuOverrides]
  )
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const router = useRouter()
  const [filters, setFilters] = useState<MenuListFilters>(EMPTY_MENU_FILTERS)
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const counts = useMemo(() => countMenuItemsByStatus(items), [items])
  const filteredItems = useMemo(() => filterMenuItems(items, filters), [items, filters])
  const isFiltered = hasActiveMenuFilters(filters)

  const handleDelete = async () => {
    if (!itemToDelete) return
    setIsDeleting(true)
    try {
      const result = await deleteMenuItemAction(itemToDelete.id, tenantId, tenantSlug)
      if (result.success) {
        toast.success(`${itemToDelete.name} deleted`)
        setItemToDelete(null)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to delete menu item')
      }
    } catch (error) {
      toast.error(describeActionError(error))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggleAvailability = async (item: MenuItem) => {
    setTogglingId(item.id)
    try {
      const result = await toggleAvailabilityAction(item.id, tenantId, tenantSlug, !item.is_available)
      if (result.success) {
        toast.success(`${item.name} is now ${item.is_available ? 'out of stock' : 'available'}`)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to update availability')
      }
    } catch (error) {
      toast.error(describeActionError(error))
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <MenuListToolbar filters={filters} counts={counts} categories={categories} onChange={setFilters} />

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {isFiltered
          ? `${filteredItems.length} of ${items.length} dish${items.length === 1 ? '' : 'es'}`
          : `${items.length} dish${items.length === 1 ? '' : 'es'}`}
      </p>

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
          {isFiltered ? (
            <>
              <SearchX className="mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="text-base font-semibold">No dishes match these filters</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Try a different search, category, or status.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilters(EMPTY_MENU_FILTERS)}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <Plus className="mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="text-base font-semibold">Your menu is empty</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add your first dish and it will appear on your storefront right away.</p>
              <Link href={`/${tenantSlug}/admin/menu/new`} className="mt-4">
                <Button><Plus className="mr-2 h-4 w-4" />Add dish</Button>
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const branchLabel = outlets.length > 0
              ? describeBranchSummary(summarizeItemAcrossBranches(item, outlets, branchIndex))
              : null
            return (
              <MenuItemCard
                key={item.id}
                item={item}
                categoryName={categoryNames.get(item.category_id)}
                tenantSlug={tenantSlug}
                branchLabel={branchLabel}
                isRecipeMissing={inventoryEnabled && linkedRecipeIds !== null && !linkedRecipeIds.has(item.id)}
                isToggling={togglingId === item.id}
                onToggleAvailability={() => void handleToggleAvailability(item)}
                onDelete={() => setItemToDelete(item)}
              />
            )
          })}
        </div>
      )}

      <AlertDialog open={itemToDelete !== null} onOpenChange={(open) => { if (!open) setItemToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {itemToDelete?.name ?? 'this dish'}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your storefront and cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
