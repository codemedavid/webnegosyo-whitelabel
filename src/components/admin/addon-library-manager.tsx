'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AddonLibraryEntry } from '@/types/database'
import { buildLibraryDraftFromMenuItem, type AddonLibraryInput } from '@/lib/addon-library-utils'
import {
  createAddonLibraryEntryAction,
  updateAddonLibraryEntryAction,
  deleteAddonLibraryEntryAction,
} from '@/app/actions/addon-library'

export interface SourceMenuItem {
  id: string
  name: string
  price: number
  discounted_price?: number | null
}

interface AddonLibraryManagerProps {
  tenantId: string
  tenantSlug: string
  initialEntries: AddonLibraryEntry[]
  menuItems: SourceMenuItem[]
}

interface DraftState {
  name: string
  price: string
  source_menu_item_id: string | null
}

const EMPTY_DRAFT: DraftState = { name: '', price: '', source_menu_item_id: null }

export function AddonLibraryManager({
  tenantId,
  tenantSlug,
  initialEntries,
  menuItems,
}: AddonLibraryManagerProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<AddonLibraryEntry[]>(initialEntries)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [isSaving, setIsSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setIsDialogOpen(true)
  }

  const openEdit = (entry: AddonLibraryEntry) => {
    setEditingId(entry.id)
    setDraft({
      name: entry.name,
      price: entry.price.toString(),
      source_menu_item_id: entry.source_menu_item_id ?? null,
    })
    setIsDialogOpen(true)
  }

  const applySourceItem = (itemId: string) => {
    const item = menuItems.find((m) => m.id === itemId)
    if (!item) return
    const prefill = buildLibraryDraftFromMenuItem(item)
    setDraft({
      name: prefill.name,
      price: String(prefill.price),
      source_menu_item_id: prefill.source_menu_item_id ?? null,
    })
  }

  const handleSave = async () => {
    const price = parseFloat(draft.price)
    if (!draft.name.trim()) {
      toast.error('Add-on name is required')
      return
    }
    if (isNaN(price) || price < 0) {
      toast.error('Price must be a non-negative number')
      return
    }

    const input: AddonLibraryInput = {
      name: draft.name.trim(),
      price,
      source_menu_item_id: draft.source_menu_item_id,
    }

    setIsSaving(true)
    try {
      const result = editingId
        ? await updateAddonLibraryEntryAction(editingId, tenantId, tenantSlug, input)
        : await createAddonLibraryEntryAction(tenantId, tenantSlug, input)

      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to save add-on')
        return
      }

      setEntries((prev) =>
        editingId
          ? prev.map((e) => (e.id === editingId ? result.data! : e))
          : [...prev, result.data!],
      )
      toast.success(editingId ? 'Add-on updated' : 'Add-on added to library')
      setIsDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save add-on')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (entry: AddonLibraryEntry) => {
    if (!confirm(`Remove "${entry.name}" from the library? Items already using it are not affected.`)) {
      return
    }
    const result = await deleteAddonLibraryEntryAction(entry.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete add-on')
      return
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    toast.success('Add-on removed from library')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Add-on
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No add-ons in your library yet. Create reusable add-ons here, then attach them to any
            item without retyping.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{entry.name}</span>
                    {entry.source_menu_item_id && (
                      <Badge variant="secondary" className="shrink-0">From menu item</Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {entry.price === 0 ? 'Free' : `₱${entry.price.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(entry)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(entry)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Add-on' : 'New Add-on'}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue={draft.source_menu_item_id ? 'from_item' : 'manual'}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="from_item" disabled={menuItems.length === 0}>
                From menu item
              </TabsTrigger>
            </TabsList>

            <TabsContent value="from_item" className="space-y-2 pt-2">
              <Label>Pick a menu item to prefill</Label>
              <Select
                value={draft.source_menu_item_id ?? undefined}
                onValueChange={applySourceItem}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a menu item" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Name and price are copied from the item. You can still edit them below.
              </p>
            </TabsContent>

            <TabsContent value="manual" className="pt-2" />
          </Tabs>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="addon-name">Name</Label>
              <Input
                id="addon-name"
                placeholder="e.g., Extra Cheese"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="addon-price">Price (₱)</Label>
              <Input
                id="addon-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={draft.price}
                onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add to Library'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
