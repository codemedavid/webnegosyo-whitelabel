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
import type { AddonLibraryEntry } from '@/types/database'
import { getAddonLibraryAction } from '@/app/actions/addon-library'

interface AddonLibraryPickerProps {
  tenantId: string
  onAttach: (entries: AddonLibraryEntry[]) => void
}

export function AddonLibraryPicker({ tenantId, onAttach }: AddonLibraryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [entries, setEntries] = useState<AddonLibraryEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const openPicker = async () => {
    setIsOpen(true)
    setSelectedIds(new Set())
    setIsLoading(true)
    try {
      const result = await getAddonLibraryAction(tenantId)
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to load add-on library')
        setEntries([])
        return
      }
      setEntries(result.data.filter((e) => e.is_active))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load add-on library')
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
      toast.error('Select at least one add-on')
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
            <DialogTitle>Add from library</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Your add-on library is empty. Create reusable add-ons under Menu → Add-ons.
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
                    <span className="flex-1 truncate">{entry.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {entry.price === 0 ? 'Free' : `₱${entry.price.toFixed(2)}`}
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
