'use client'

import { useState } from 'react'
import { Library } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AddonLibraryEntry, ModifierGroupLibraryEntry } from '@/types/database'
import { getModifierGroupLibraryAction } from '@/app/actions/modifier-library'
import { getAddonLibraryAction } from '@/app/actions/addon-library'
import { uniqueLibraryGroups } from '@/lib/addon-groups/library-duplicates'
import { groupNameKey } from '@/lib/addon-groups/place-group'
import { formatPrice } from '@/lib/cart-utils'

interface ModifierLibraryPickerProps {
  tenantId: string
  onAttach: (entries: ModifierGroupLibraryEntry[]) => void
  /** Names of the groups the dish already has; a match is REPLACED on attach. */
  existingGroupNames?: readonly string[]
  /** When given, single library add-ons are offered too (added to the dish's add-ons group). */
  onAttachAddons?: (entries: AddonLibraryEntry[]) => void
}

/** Human-readable one-liner for a group's selection rules + option count. */
function describeEntry(entry: ModifierGroupLibraryEntry): string {
  const count = `${entry.options.length} option${entry.options.length === 1 ? '' : 's'}`
  const kind =
    entry.selection_mode === 'quantity'
      ? 'add-ons · quantities'
      : entry.max_select === 1
      ? 'single-select'
      : entry.max_select === null
        ? 'multi-select'
        : `up to ${entry.max_select}`
  const required = entry.min_select >= 1 ? 'required' : 'optional'
  return `${kind} · ${required} · ${count}`
}

const PREVIEW_OPTIONS = 4

function previewOptions(entry: ModifierGroupLibraryEntry): string {
  const shown = entry.options
    .slice(0, PREVIEW_OPTIONS)
    .map((option) => (option.price_modifier > 0 ? `${option.name} +${formatPrice(option.price_modifier)}` : option.name))
  const more = entry.options.length - shown.length
  return more > 0 ? `${shown.join(' · ')} · +${more} more` : shown.join(' · ')
}

function toggleIn(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * "Add from library" control for the modifier-groups editor. Loads the tenant's
 * saved groups (identical copies shown once) and, when the editor accepts them,
 * single add-ons. A group named like one the dish already has is marked: the
 * editor replaces it, so a free imported "Add-ons" group can be fixed from here.
 */
export function ModifierLibraryPicker({ tenantId, onAttach, existingGroupNames = [], onAttachAddons }: ModifierLibraryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [entries, setEntries] = useState<ModifierGroupLibraryEntry[]>([])
  const [addons, setAddons] = useState<AddonLibraryEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [selectedAddonIds, setSelectedAddonIds] = useState<ReadonlySet<string>>(new Set())

  const takenNames = new Set(existingGroupNames.map(groupNameKey))

  const openPicker = async () => {
    setIsOpen(true)
    setSelectedIds(new Set())
    setSelectedAddonIds(new Set())
    setIsLoading(true)
    try {
      const [groupResult, addonResult] = await Promise.all([
        getModifierGroupLibraryAction(tenantId),
        onAttachAddons ? getAddonLibraryAction(tenantId) : Promise.resolve({ success: true, data: [] as AddonLibraryEntry[] }),
      ])
      if (!groupResult.success || !groupResult.data) {
        toast.error(groupResult.error ?? 'Failed to load modifier library')
        setEntries([])
      } else {
        setEntries(uniqueLibraryGroups(groupResult.data.filter((e) => e.is_active)).map(({ entry }) => entry))
      }
      setAddons(addonResult.success && addonResult.data ? addonResult.data.filter((a) => a.is_active) : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load modifier library')
    } finally {
      setIsLoading(false)
    }
  }

  const selectionCount = selectedIds.size + selectedAddonIds.size

  const handleAttach = () => {
    const chosen = entries.filter((e) => selectedIds.has(e.id))
    const chosenAddons = addons.filter((a) => selectedAddonIds.has(a.id))
    if (chosen.length === 0 && chosenAddons.length === 0) {
      toast.error('Select at least one group')
      return
    }
    if (chosen.length > 0) onAttach(chosen)
    if (chosenAddons.length > 0) onAttachAddons?.(chosenAddons)
    setIsOpen(false)
  }

  const isEmpty = entries.length === 0 && addons.length === 0

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openPicker}>
        <Library className="mr-2 h-4 w-4" />
        Add from library
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add from your library</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : isEmpty ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Your library is empty. Create add-on groups under Menu → Add-ons, or save a group from a dish.
            </p>
          ) : (
            <ScrollArea className="max-h-80 pr-3">
              <div className="space-y-1">
                {entries.length > 0 && onAttachAddons && (
                  <p className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groups</p>
                )}
                {entries.map((entry) => {
                  const willReplace = takenNames.has(groupNameKey(entry.name))
                  return (
                    <label key={entry.id} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted">
                      <Checkbox
                        className="mt-0.5"
                        checked={selectedIds.has(entry.id)}
                        onCheckedChange={() => setSelectedIds((prev) => toggleIn(prev, entry.id))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{entry.name}</span>
                        <span className="block text-xs text-muted-foreground">{describeEntry(entry)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{previewOptions(entry)}</span>
                        {willReplace && (
                          <span className="block text-xs font-medium text-amber-700 dark:text-amber-400">
                            Replaces this dish’s {entry.name}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}

                {addons.length > 0 && (
                  <p className="px-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Single add-ons</p>
                )}
                {addons.map((addon) => (
                  <label key={addon.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted">
                    <Checkbox
                      aria-label={addon.name}
                      checked={selectedAddonIds.has(addon.id)}
                      onCheckedChange={() => setSelectedAddonIds((prev) => toggleIn(prev, addon.id))}
                    />
                    <span className="flex-1 truncate">{addon.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {addon.price === 0 ? 'Free' : `+${formatPrice(addon.price)}`}
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAttach} disabled={isLoading || selectionCount === 0}>
              Attach {selectionCount > 0 ? `(${selectionCount})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
