'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { InventoryUnitRow, InventoryUnitDimension } from '@/types/database'
import { EMPTY_UNIT_DRAFT, buildUnitInput, unitToDraft, type UnitDraft } from '@/lib/inventory/inventory-form'
import { createInventoryUnitAction, updateInventoryUnitAction, deleteInventoryUnitAction } from '@/app/actions/inventory'

const DIMENSIONS: InventoryUnitDimension[] = ['weight', 'volume', 'count']

interface UnitsTabProps {
  tenantId: string
  tenantSlug: string
  units: InventoryUnitRow[]
  onChange: (next: InventoryUnitRow[]) => void
}

export function UnitsTab({ tenantId, tenantSlug, units, onChange }: UnitsTabProps) {
  // No router.refresh() after a save: the inventory actions revalidate, and a
  // revalidating Server Action already re-renders this route in its response.
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_UNIT_DRAFT)
  const [isSaving, setIsSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_UNIT_DRAFT)
    setIsOpen(true)
  }

  const openEdit = (unit: InventoryUnitRow) => {
    setEditingId(unit.id)
    setDraft(unitToDraft(unit))
    setIsOpen(true)
  }

  const handleSave = async () => {
    let input
    try {
      input = buildUnitInput(draft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setIsSaving(true)
    try {
      const result = editingId
        ? await updateInventoryUnitAction(editingId, tenantId, tenantSlug, input)
        : await createInventoryUnitAction(tenantId, tenantSlug, input)

      if (!result.success) {
        toast.error(result.error ?? 'We could not save this unit. Check the form and try again.')
        return
      }

      const saved = result.data
      onChange(
        editingId
          ? units.map((u) => (u.id === editingId ? saved : u))
          : [...units, saved],
      )
      toast.success(editingId ? 'Unit updated' : 'Unit added')
      setIsOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (unit: InventoryUnitRow) => {
    if (
      !confirm(
        `Delete ${unit.name}?\n\nAny ingredient measured in it needs a new unit before you can record stock against it.`,
      )
    )
      return
    const result = await deleteInventoryUnitAction(unit.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? `We could not delete ${unit.name}. Try again in a moment.`)
      return
    }
    onChange(units.filter((u) => u.id !== unit.id))
    toast.success('Unit deleted')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="max-sm:h-11 max-sm:w-full" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Unit
        </Button>
      </div>

      {units.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No units yet. Grams, millilitres, pieces — recipes use them to turn a quantity into a
          cost.
        </p>
      ) : (
        /*
          The same row grammar as an ingredient: name leads, a meta line sits
          under it, actions cluster right. A plain bordered row rather than a
          Card, because this list now lives inside a dialog and a card inside a
          card is never the answer.
        */
        <ul className="divide-y rounded-xl border">
          {units.map((unit) => (
            <li key={unit.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">
                    {unit.name} ({unit.abbreviation})
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {unit.dimension}
                  </Badge>
                  {unit.is_base && <Badge variant="secondary">Base</Badge>}
                </div>
                <span className="text-sm text-muted-foreground">
                  1 {unit.abbreviation} = {unit.to_base_factor} base
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="max-sm:h-11"
                  onClick={() => openEdit(unit)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive max-sm:size-11"
                  aria-label={`Delete ${unit.name}`}
                  onClick={() => handleDelete(unit)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Unit' : 'New Unit'}</DialogTitle>
          </DialogHeader>

          <div className="-mx-6 space-y-3 overflow-y-auto px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="unit-name">Name</Label>
                <Input
                  id="unit-name"
                  placeholder="e.g., Gram"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="unit-abbr">Abbreviation</Label>
                <Input
                  id="unit-abbr"
                  placeholder="e.g., g"
                  value={draft.abbreviation}
                  onChange={(e) => setDraft((d) => ({ ...d, abbreviation: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Dimension</Label>
                <Select
                  value={draft.dimension}
                  onValueChange={(value) =>
                    setDraft((d) => ({ ...d, dimension: value as InventoryUnitDimension }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIMENSIONS.map((dim) => (
                      <SelectItem key={dim} value={dim} className="capitalize">
                        {dim}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="unit-factor">Conversion to base</Label>
                <Input
                  id="unit-factor"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="1"
                  value={draft.to_base_factor}
                  onChange={(e) => setDraft((d) => ({ ...d, to_base_factor: e.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 max-sm:min-h-11">
              <input
                type="checkbox"
                checked={draft.is_base}
                onChange={(e) => setDraft((d) => ({ ...d, is_base: e.target.checked }))}
                className="h-4 w-4 max-sm:h-5 max-sm:w-5"
              />
              <span className="text-sm">Base unit for its dimension</span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="max-sm:h-11"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button className="max-sm:h-11" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
