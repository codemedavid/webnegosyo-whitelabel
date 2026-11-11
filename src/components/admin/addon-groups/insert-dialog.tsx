'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { countSameNameGroups, type DishRef } from '@/lib/addon-groups/dish-directory'
import { groupNameKey, type GroupConflict } from '@/lib/addon-groups/place-group'
import { insertAddonGroupIntoDishesAction } from '@/app/actions/addon-groups'
import { callAction } from '@/components/admin/addon-groups/call-action'
import type { ModifierGroupLibraryEntry } from '@/types/database'

interface InsertDialogProps {
  tenantId: string
  tenantSlug: string
  entry: ModifierGroupLibraryEntry | null
  dishes: DishRef[]
  onOpenChange: (isOpen: boolean) => void
  /** Called with the dish ids that now carry the group. */
  onInserted: (dishIds: string[]) => void
}

export function InsertDialog(props: InsertDialogProps) {
  return (
    <Dialog open={props.entry !== null} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        {props.entry && <InsertBody key={props.entry.id} {...props} entry={props.entry} />}
      </DialogContent>
    </Dialog>
  )
}

function groupByCategory(dishes: readonly DishRef[]): Array<{ name: string; dishes: DishRef[] }> {
  return dishes.reduce<Array<{ name: string; dishes: DishRef[] }>>((sections, dish) => {
    const last = sections[sections.length - 1]
    return last && last.name === dish.categoryName
      ? [...sections.slice(0, -1), { ...last, dishes: [...last.dishes, dish] }]
      : [...sections, { name: dish.categoryName, dishes: [dish] }]
  }, [])
}

function resultMessage(result: { added: number; replaced: number; skipped: number }): string {
  const parts = [
    result.added > 0 ? `added to ${result.added}` : '',
    result.replaced > 0 ? `replaced on ${result.replaced}` : '',
    result.skipped > 0 ? `${result.skipped} left as they were` : '',
  ].filter(Boolean)
  return parts.length > 0 ? `Group ${parts.join(', ')}` : 'Nothing changed'
}

function InsertBody({ tenantId, tenantSlug, entry, dishes, onOpenChange, onInserted }: InsertDialogProps & { entry: ModifierGroupLibraryEntry }) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [onConflict, setOnConflict] = useState<GroupConflict>('replace')
  const [isSaving, setIsSaving] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle === ''
      ? dishes
      : dishes.filter((dish) => `${dish.name} ${dish.categoryName}`.toLowerCase().includes(needle))
  }, [dishes, query])
  const sections = useMemo(() => groupByCategory(visible), [visible])
  const conflicts = countSameNameGroups(dishes, chosen, entry.name)
  const hasGroup = (dish: DishRef): boolean => dish.groupNames.some((name) => groupNameKey(name) === groupNameKey(entry.name))

  const toggle = (ids: readonly string[], isOn: boolean) =>
    setChosen((current) => {
      const next = new Set(current)
      ids.forEach((id) => (isOn ? next.add(id) : next.delete(id)))
      return next
    })

  const handleInsert = async () => {
    setIsSaving(true)
    const result = await callAction(
      () => insertAddonGroupIntoDishesAction(tenantId, tenantSlug, { entryId: entry.id, itemIds: [...chosen], onConflict }),
      'Failed to add the group to dishes'
    )
    setIsSaving(false)
    if (!result) return
    if (result.failed.length > 0) {
      toast.error(`Could not update ${result.failed.join(', ')}. Check that you can edit the menu, then try again.`)
    }
    if (result.updatedIds.length > 0 || result.failed.length === 0) toast.success(resultMessage(result))
    onInserted(result.updatedIds)
    onOpenChange(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Insert “{entry.name}” into dishes</DialogTitle>
      </DialogHeader>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search dishes or categories" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {sections.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No dishes match.</p>}
        {sections.map((section) => {
          const ids = section.dishes.map((dish) => dish.id)
          const isAllOn = ids.every((id) => chosen.has(id))
          return (
            <section key={section.name} className="py-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-muted">
                <Checkbox checked={isAllOn} onCheckedChange={(value) => toggle(ids, value === true)} />
                {section.name}
                <span className="font-normal text-muted-foreground">· {ids.length}</span>
              </label>
              {section.dishes.map((dish) => (
                <label key={dish.id} className="flex cursor-pointer items-center gap-3 rounded-md py-1.5 pl-8 pr-2 text-sm hover:bg-muted">
                  <Checkbox checked={chosen.has(dish.id)} onCheckedChange={(value) => toggle([dish.id], value === true)} />
                  <span className="flex-1 truncate">{dish.name}</span>
                  {hasGroup(dish) && <span className="shrink-0 text-xs text-muted-foreground">has {entry.name}</span>}
                </label>
              ))}
            </section>
          )
        })}
      </div>

      {conflicts > 0 && (
        <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
          <p>
            {conflicts === 1 ? '1 chosen dish already has' : `${conflicts} chosen dishes already have`} a group called “{entry.name}”.
          </p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Dishes that already have this group">
            {([
              ['replace', 'Replace it with this one'],
              ['skip', 'Leave those dishes as they are'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={onConflict === value}
                onClick={() => setOnConflict(value)}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  onConflict === value ? 'border-primary bg-background' : 'hover:bg-background'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleInsert} disabled={isSaving || chosen.size === 0}>
          {isSaving ? 'Saving…' : chosen.size === 0 ? 'Pick dishes' : `Insert into ${chosen.size} ${chosen.size === 1 ? 'dish' : 'dishes'}`}
        </Button>
      </DialogFooter>
    </>
  )
}
