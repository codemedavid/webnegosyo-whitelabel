'use client'

import { useMemo, useState } from 'react'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddonLibraryManager, type SourceMenuItem } from '@/components/admin/addon-library-manager'
import { GroupEditorDialog, type PriceSource } from '@/components/admin/addon-groups/group-editor-dialog'
import { InsertDialog } from '@/components/admin/addon-groups/insert-dialog'
import { callAction } from '@/components/admin/addon-groups/call-action'
import { duplicateCopyIds, uniqueLibraryGroups } from '@/lib/addon-groups/library-duplicates'
import { groupNameKey } from '@/lib/addon-groups/place-group'
import type { DishRef } from '@/lib/addon-groups/dish-directory'
import { formatPrice } from '@/lib/cart-utils'
import { deleteModifierGroupLibraryEntryAction } from '@/app/actions/modifier-library'
import { removeDuplicateAddonGroupsAction } from '@/app/actions/addon-groups'
import type { AddonLibraryEntry, ModifierGroupLibraryEntry } from '@/types/database'

interface AddonGroupsWorkspaceProps {
  tenantId: string
  tenantSlug: string
  initialGroups: ModifierGroupLibraryEntry[]
  singleAddons: AddonLibraryEntry[]
  dishes: DishRef[]
  menuItems: SourceMenuItem[]
}

const PREVIEW_OPTIONS = 4

function describeRule(entry: ModifierGroupLibraryEntry): string {
  const need = entry.min_select > 0 ? 'Required' : 'Optional'
  if (entry.selection_mode === 'quantity') {
    return entry.max_select === null ? `${need} · choose how many` : `${need} · up to ${entry.max_select} portions`
  }
  if (entry.max_select === 1) return `${need} · pick one`
  return entry.max_select === null ? `${need} · pick any` : `${need} · pick up to ${entry.max_select}`
}

function previewOptions(entry: ModifierGroupLibraryEntry): string {
  const shown = entry.options
    .slice(0, PREVIEW_OPTIONS)
    .map((option) => (option.price_modifier > 0 ? `${option.name} +${formatPrice(option.price_modifier)}` : option.name))
  const more = entry.options.length - shown.length
  return more > 0 ? `${shown.join(' · ')} · +${more} more` : shown.join(' · ')
}

export function AddonGroupsWorkspace({ tenantId, tenantSlug, initialGroups, singleAddons, dishes: initialDishes, menuItems }: AddonGroupsWorkspaceProps) {
  const [groups, setGroups] = useState(initialGroups)
  const [dishes, setDishes] = useState(initialDishes)
  const [editing, setEditing] = useState<{ entry: ModifierGroupLibraryEntry | null } | null>(null)
  const [inserting, setInserting] = useState<ModifierGroupLibraryEntry | null>(null)
  const [isCleaning, setIsCleaning] = useState(false)

  const unique = useMemo(() => uniqueLibraryGroups(groups), [groups])
  const copyCount = useMemo(() => duplicateCopyIds(groups).length, [groups])
  const priceSources: PriceSource[] = useMemo(
    () => menuItems.map((item) => ({ id: item.id, name: item.name, price: item.discounted_price ?? item.price })),
    [menuItems]
  )

  const handleSaved = (saved: ModifierGroupLibraryEntry) =>
    setGroups((current) =>
      current.some((entry) => entry.id === saved.id)
        ? current.map((entry) => (entry.id === saved.id ? saved : entry))
        : [...current, saved]
    )

  const handleDelete = async (entry: ModifierGroupLibraryEntry) => {
    if (!confirm(`Delete "${entry.name}" from your saved groups? Dishes that already have it keep their copy.`)) return
    const result = await callAction(async () => {
      const reply = await deleteModifierGroupLibraryEntryAction(entry.id, tenantId, tenantSlug)
      return { ...reply, data: reply.success ? true : undefined }
    }, 'Failed to delete the group')
    if (!result) return
    setGroups((current) => current.filter((candidate) => candidate.id !== entry.id))
    toast.success('Group deleted')
  }

  const handleRemoveCopies = async () => {
    setIsCleaning(true)
    const result = await callAction(() => removeDuplicateAddonGroupsAction(tenantId, tenantSlug), 'Failed to remove the copies')
    setIsCleaning(false)
    if (!result) return
    const removed = new Set(result.removedIds)
    setGroups((current) => current.filter((entry) => !removed.has(entry.id)))
    toast.success(result.removed === 0 ? 'No copies were removed' : `Removed ${result.removed} identical ${result.removed === 1 ? 'copy' : 'copies'}`)
  }

  const handleInserted = (entry: ModifierGroupLibraryEntry, dishIds: string[]) => {
    const touched = new Set(dishIds)
    const key = groupNameKey(entry.name)
    setDishes((current) =>
      current.map((dish) =>
        touched.has(dish.id) && !dish.groupNames.some((name) => groupNameKey(name) === key)
          ? { ...dish, groupNames: [...dish.groupNames, entry.name] }
          : dish
      )
    )
  }

  return (
    <Tabs defaultValue="groups">
      <TabsList>
        <TabsTrigger value="groups">Add-on groups</TabsTrigger>
        <TabsTrigger value="single">Single add-ons</TabsTrigger>
      </TabsList>

      <TabsContent value="groups" className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Build a group once, like <span className="font-medium text-foreground">Add-ons</span> with Fried Rice and Egg, then
            insert it into as many dishes as you like.
          </p>
          <Button className="shrink-0" onClick={() => setEditing({ entry: null })}>
            <Plus className="mr-2 h-4 w-4" />
            New group
          </Button>
        </div>

        {copyCount > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <p>
              {copyCount} saved {copyCount === 1 ? 'group is an exact copy' : 'groups are exact copies'} of another. Dishes keep
              their own copy, so removing these changes no dish.
            </p>
            <Button variant="outline" size="sm" className="shrink-0 bg-background" onClick={handleRemoveCopies} disabled={isCleaning}>
              {isCleaning ? 'Removing…' : 'Remove copies'}
            </Button>
          </div>
        )}

        {unique.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
              <Layers className="h-8 w-8" />
              No groups yet. Create one, then insert it into your dishes in one go.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {unique.map(({ entry, copies }) => (
              <Card key={entry.id}>
                <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{entry.name}</span>
                      <Badge variant="secondary">{describeRule(entry)}</Badge>
                      {copies > 1 && <Badge variant="outline">saved {copies}×</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{previewOptions(entry)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" onClick={() => setInserting(entry)} disabled={dishes.length === 0}>
                      Insert into dishes
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Edit ${entry.name}`} onClick={() => setEditing({ entry })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${entry.name}`} onClick={() => handleDelete(entry)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="single" className="pt-2">
        <AddonLibraryManager tenantId={tenantId} tenantSlug={tenantSlug} initialEntries={singleAddons} menuItems={menuItems} />
      </TabsContent>

      <GroupEditorDialog
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        entry={editing?.entry ?? null}
        isOpen={editing !== null}
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        singleAddons={singleAddons.filter((addon) => addon.is_active)}
        dishes={priceSources}
        onSaved={handleSaved}
      />

      <InsertDialog
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        entry={inserting}
        dishes={dishes}
        onOpenChange={(isOpen) => !isOpen && setInserting(null)}
        onInserted={(ids) => inserting && handleInserted(inserting, ids)}
      />
    </Tabs>
  )
}
