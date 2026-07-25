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
import type { ModifierGroupLibraryEntry } from '@/types/database'
import { getModifierGroupLibraryAction } from '@/app/actions/modifier-library'

interface ModifierLibraryPickerProps {
  tenantId: string
  onAttach: (entries: ModifierGroupLibraryEntry[]) => void
}

/** Human-readable one-liner for a group's selection rules + option count. */
function describeEntry(entry: ModifierGroupLibraryEntry): string {
  const count = `${entry.options.length} option${entry.options.length === 1 ? '' : 's'}`
  const kind =
    entry.max_select === 1
      ? 'single-select'
      : entry.max_select === null
        ? 'multi-select'
        : `up to ${entry.max_select}`
  const required = entry.min_select >= 1 ? 'required' : 'optional'
  return `${kind} · ${required} · ${count}`
}

/**
 * "Add from library" control for the modifier-groups editor. Loads the tenant's
 * active library entries on open, multi-select, and hands the chosen entries to
 * the parent, which snapshots them onto the item via `attachEntriesToGroups`.
 */
export function ModifierLibraryPicker({ tenantId, onAttach }: ModifierLibraryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [entries, setEntries] = useState<ModifierGroupLibraryEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const openPicker = async () => {
    setIsOpen(true)
    setSelectedIds(new Set())
    setIsLoading(true)
    try {
      const result = await getModifierGroupLibraryAction(tenantId)
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to load modifier library')
        setEntries([])
        return
      }
      setEntries(result.data.filter((e) => e.is_active))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load modifier library')
    } finally {
      setIsLoading(false)
    }
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAttach = () => {
    const chosen = entries.filter((e) => selectedIds.has(e.id))
    if (chosen.length === 0) {
      toast.error('Select at least one group')
      return
    }
    onAttach(chosen)
    setIsOpen(false)
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openPicker}>
        <Library className="mr-2 h-4 w-4" />
        Add from library
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add modifier group from library</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Your modifier library is empty. Save a group as reusable, then attach it to any item.
            </p>
          ) : (
            <ScrollArea className="max-h-72 pr-3">
              <div className="space-y-1">
                {entries.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
                  >
                    <Checkbox
                      checked={selectedIds.has(entry.id)}
                      onCheckedChange={() => toggle(entry.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{entry.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {describeEntry(entry)}
                      </span>
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
            <Button onClick={handleAttach} disabled={isLoading || selectedIds.size === 0}>
              Attach {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
