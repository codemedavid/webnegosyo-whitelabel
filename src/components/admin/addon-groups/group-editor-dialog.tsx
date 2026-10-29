'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  blankOption,
  draftFromEntry,
  draftToInput,
  emptyGroupDraft,
  type GroupDraft,
  type GroupDraftMode,
  type GroupDraftOption,
} from '@/lib/addon-groups/group-draft'
import {
  createModifierGroupLibraryEntryAction,
  updateModifierGroupLibraryEntryAction,
} from '@/app/actions/modifier-library'
import { callAction } from '@/components/admin/addon-groups/call-action'
import type { AddonLibraryEntry, ModifierGroupLibraryEntry } from '@/types/database'

export interface PriceSource {
  id: string
  name: string
  price: number
}

interface GroupEditorDialogProps {
  tenantId: string
  tenantSlug: string
  /** The group being edited; null = a new group. */
  entry: ModifierGroupLibraryEntry | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  singleAddons: AddonLibraryEntry[]
  dishes: PriceSource[]
  onSaved: (entry: ModifierGroupLibraryEntry) => void
}

const MODE_COPY: Record<GroupDraftMode, { label: string; hint: string; limit: string }> = {
  quantity: {
    label: 'Add-ons',
    hint: 'Customers choose how many of each (Fried Rice ×2).',
    limit: 'Most portions in total (blank = no limit)',
  },
  choice: {
    label: 'Pick from a list',
    hint: 'Customers tick options, like a flavor or a side.',
    limit: 'Most options they can pick (blank = any)',
  },
}

const SOURCE_PREFIX = { addon: 'addon:', dish: 'dish:' } as const

export function GroupEditorDialog(props: GroupEditorDialogProps) {
  // Re-seeded per open: a key on the body resets the draft for each group.
  return (
    <Dialog open={props.isOpen} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {props.isOpen && <GroupEditorBody key={props.entry?.id ?? 'new'} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function GroupEditorBody({ tenantId, tenantSlug, entry, onOpenChange, singleAddons, dishes, onSaved }: GroupEditorDialogProps) {
  const [draft, setDraft] = useState<GroupDraft>(() => (entry ? draftFromEntry(entry) : emptyGroupDraft()))
  const [isSaving, setIsSaving] = useState(false)

  const update = (patch: Partial<GroupDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const updateOption = (key: string, patch: Partial<GroupDraftOption>) =>
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) => (option.key === key ? { ...option, ...patch } : option)),
    }))
  const removeOption = (key: string) =>
    setDraft((current) => ({ ...current, options: current.options.filter((option) => option.key !== key) }))
  const appendOption = (name = '', price = '') =>
    setDraft((current) => ({
      ...current,
      // A blank last row is filled in rather than left behind.
      options: [...current.options.filter((option) => option.name.trim() !== '' || name === ''), blankOption(name, price)],
    }))

  const addFromSource = (value: string) => {
    const source = value.startsWith(SOURCE_PREFIX.addon)
      ? singleAddons.find((addon) => `${SOURCE_PREFIX.addon}${addon.id}` === value)
      : dishes.find((dish) => `${SOURCE_PREFIX.dish}${dish.id}` === value)
    if (!source) return
    const isTaken = draft.options.some((option) => option.name.trim().toLowerCase() === source.name.trim().toLowerCase())
    if (isTaken) {
      toast.info(`${source.name} is already in this group`)
      return
    }
    appendOption(source.name, String(source.price))
  }

  const handleSave = async () => {
    const result = draftToInput(draft)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setIsSaving(true)
    const saved = await callAction(
      () =>
        entry
          ? updateModifierGroupLibraryEntryAction(entry.id, tenantId, tenantSlug, result.input)
          : createModifierGroupLibraryEntryAction(tenantId, tenantSlug, result.input),
      'Failed to save the group'
    )
    setIsSaving(false)
    if (!saved) return
    toast.success(entry ? 'Group saved' : `"${result.input.name}" is ready to insert into dishes`)
    onSaved(saved as ModifierGroupLibraryEntry)
    onOpenChange(false)
  }

  const copy = MODE_COPY[draft.mode]

  return (
    <>
      <DialogHeader>
        <DialogTitle>{entry ? 'Edit add-on group' : 'New add-on group'}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="group-name">Group name</Label>
          <Input
            id="group-name"
            placeholder="e.g. Add-ons, Choice of rice, Drinks"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How customers choose">
          {(Object.keys(MODE_COPY) as GroupDraftMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={draft.mode === mode}
              onClick={() => update({ mode })}
              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                draft.mode === mode ? 'border-primary bg-primary/5' : 'hover:bg-muted'
              }`}
            >
              <span className="block font-medium">{MODE_COPY[mode].label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{MODE_COPY[mode].hint}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
          <Label htmlFor="group-required" className="text-sm font-normal">
            Customers must pick at least one
          </Label>
          <Switch id="group-required" checked={draft.isRequired} onCheckedChange={(isRequired) => update({ isRequired })} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="group-max">{copy.limit}</Label>
          <Input
            id="group-max"
            inputMode="numeric"
            placeholder="No limit"
            value={draft.maxText}
            onChange={(event) => update({ maxText: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Add-ons in this group</Label>
          {draft.options.map((option, index) => (
            <div key={option.key} className="flex items-center gap-2">
              <Input
                aria-label={`Add-on ${index + 1} name`}
                placeholder="e.g. Fried Rice"
                value={option.name}
                onChange={(event) => updateOption(option.key, { name: event.target.value })}
              />
              <div className="relative w-28 shrink-0">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+₱</span>
                <Input
                  aria-label={`Add-on ${index + 1} price`}
                  inputMode="decimal"
                  className="pl-8"
                  placeholder="0"
                  value={option.price}
                  onChange={(event) => updateOption(option.key, { price: event.target.value })}
                />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove add-on" onClick={() => removeOption(option.key)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" size="sm" onClick={() => appendOption()}>
              <Plus className="mr-2 h-4 w-4" />
              Add a row
            </Button>
            {(singleAddons.length > 0 || dishes.length > 0) && (
              <Select value="" onValueChange={addFromSource}>
                <SelectTrigger className="h-9 sm:w-56">
                  <SelectValue placeholder="Copy from your add-ons or dishes" />
                </SelectTrigger>
                <SelectContent>
                  {singleAddons.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Single add-ons</SelectLabel>
                      {singleAddons.map((addon) => (
                        <SelectItem key={addon.id} value={`${SOURCE_PREFIX.addon}${addon.id}`}>
                          {addon.name} · ₱{addon.price}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {dishes.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Dishes</SelectLabel>
                      {dishes.map((dish) => (
                        <SelectItem key={dish.id} value={`${SOURCE_PREFIX.dish}${dish.id}`}>
                          {dish.name} · ₱{dish.price}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : entry ? 'Save group' : 'Create group'}
        </Button>
      </DialogFooter>
    </>
  )
}
