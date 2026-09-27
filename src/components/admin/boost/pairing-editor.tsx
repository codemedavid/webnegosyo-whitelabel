'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteBoostPairingAction, saveBoostPairingAction } from '@/app/actions/boost'
import { MAX_PAIRING_TARGETS } from '@/lib/boost/pairing-limits'
import type { BoostIdea } from '@/lib/boost/ideas'
import type { PairingGroup } from '@/lib/boost/pairing-groups'
import type { BoostItem } from '@/lib/boost/workspace'
import { EditorShell, FieldBlock } from './editor-shell'
import { ItemPicker } from './item-picker'
import { ItemsSlot } from './item-slot'
import { DishPhoto } from './dish'
import { PairingPreview } from './previews'
import { peso } from './boost-model'
import type { EditorEnvironment } from './editor-types'

const EXTRA_ROLES = new Set(['side', 'drink', 'dessert'])

interface PairingEditorProps extends EditorEnvironment {
  group: PairingGroup | null
  idea?: BoostIdea
  /** Items another pairing already covers. */
  takenSourceIds: ReadonlySet<string>
}

type Picking = 'sources' | 'targets' | null

export function PairingEditor(props: PairingEditorProps) {
  const { group, idea, takenSourceIds, tenantId, tenantSlug, items, itemsById, theme, onSaved, onClose } = props
  const initial = useMemo(() => ({
    sourceIds: group?.sourceIds ?? (idea?.kind === 'pairing' ? idea.sourceIds : []),
    targetIds: group?.targetIds ?? (idea?.kind === 'pairing' ? idea.targetIds : []),
    isActive: group?.isActive ?? true,
  }), [group, idea])

  const [form, setForm] = useState(initial)
  const [picking, setPicking] = useState<Picking>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  const targets = form.targetIds.map((id) => itemsById.get(id)).filter((item): item is BoostItem => !!item)
  const firstSource = itemsById.get(form.sourceIds[0])

  // Items already in another pairing would be silently moved into this one.
  const excludedSources = useMemo(
    () => [...takenSourceIds].filter((id) => !(group?.sourceIds ?? []).includes(id)),
    [takenSourceIds, group]
  )
  // Sides, drinks and desserts first: they are what people add after a main.
  const targetSuggestions = useMemo(
    () => items
      .filter((item) => EXTRA_ROLES.has(item.role) && item.isAvailable && !form.sourceIds.includes(item.id))
      .slice(0, 6)
      .map((item) => ({ id: item.id, reason: item.role.charAt(0).toUpperCase() + item.role.slice(1) })),
    [items, form.sourceIds]
  )

  const moveTarget = (index: number, delta: number) => {
    const next = [...form.targetIds]
    const [moved] = next.splice(index, 1)
    next.splice(index + delta, 0, moved)
    update({ targetIds: next })
  }

  const handleSave = async () => {
    if (form.sourceIds.length === 0) return setError('Choose the items that trigger the suggestion')
    if (form.targetIds.length === 0) return setError('Choose at least one thing to suggest')
    setError(null)
    setIsSaving(true)
    const response = await saveBoostPairingAction(tenantId, tenantSlug, {
      previousSourceIds: group?.sourceIds ?? [],
      sourceIds: form.sourceIds,
      targetIds: form.targetIds,
      isActive: form.isActive,
    })
    setIsSaving(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    onSaved(group ? 'Pairing saved' : 'Pairing is live')
  }

  const handleDelete = async () => {
    if (!group) return
    setIsDeleting(true)
    const response = await deleteBoostPairingAction(tenantId, tenantSlug, group.sourceIds)
    setIsDeleting(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    onSaved('Pairing deleted')
  }

  const overlay = picking ? (
    <ItemPicker
      items={items}
      mode="multi"
      title={picking === 'sources' ? 'After they add…' : 'Suggest…'}
      hint={picking === 'sources'
        ? 'Pick a category chip, then “Select all” to cover a whole category'
        : `Up to ${MAX_PAIRING_TARGETS}, in the order customers see them`}
      selectedIds={picking === 'sources' ? form.sourceIds : form.targetIds}
      max={picking === 'targets' ? MAX_PAIRING_TARGETS : undefined}
      suggestions={picking === 'targets' ? targetSuggestions : []}
      excludeIds={picking === 'sources' ? excludedSources : form.sourceIds}
      onDone={(ids) => {
        if (picking === 'sources') {
          update({ sourceIds: ids, targetIds: form.targetIds.filter((id) => !ids.includes(id)) })
          setPicking(form.targetIds.length === 0 ? 'targets' : null)
        } else {
          update({ targetIds: ids })
          setPicking(null)
        }
        setError(null)
      }}
      onBack={() => setPicking(null)}
    />
  ) : undefined

  return (
    <EditorShell
      title={group ? 'Pairing' : 'New pairing'}
      subtitle="Right after adding · “Goes well with”"
      preview={<PairingPreview added={firstSource} suggestions={targets} theme={theme} />}
      overlay={overlay}
      isLive={form.isActive}
      onLiveChange={(isActive) => update({ isActive })}
      isDirty={isDirty}
      isSaving={isSaving}
      saveLabel={group ? 'Save' : 'Create pairing'}
      onSave={handleSave}
      onDelete={group ? handleDelete : undefined}
      isDeleting={isDeleting}
      onClose={onClose}
    >
      <FieldBlock
        title="After a customer adds"
        hint="One item, a few, or a whole category."
        error={error ?? undefined}
      >
        <ItemsSlot ids={form.sourceIds} itemsById={itemsById} placeholder="Choose items" onClick={() => setPicking('sources')} />
      </FieldBlock>

      <FieldBlock
        title="Suggest"
        hint={`Up to ${MAX_PAIRING_TARGETS}. The first one gets the most attention.`}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking('targets')}>
            {targets.length ? 'Change' : 'Choose'}
          </Button>
        }
      >
        {targets.length === 0 ? (
          <button
            type="button"
            onClick={() => setPicking('targets')}
            className="w-full rounded-2xl border border-dashed py-8 text-sm text-muted-foreground hover:text-foreground"
          >
            Choose a side, drink or dessert
          </button>
        ) : (
          <ol className="space-y-2">
            {targets.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl border p-2.5">
                <DishPhoto item={item} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">+{peso(item.price)}</span>
                </span>
                <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveTarget(index, -1)} aria-label={`Move ${item.name} up`}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={index === targets.length - 1} onClick={() => moveTarget(index, 1)} aria-label={`Move ${item.name} down`}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => update({ targetIds: form.targetIds.filter((id) => id !== item.id) })} aria-label={`Remove ${item.name}`}>
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </FieldBlock>
    </EditorShell>
  )
}
