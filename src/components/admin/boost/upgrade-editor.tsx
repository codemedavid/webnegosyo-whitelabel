'use client'

import { useMemo, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { deleteBoostUpgradeAction, saveBoostUpgradeAction } from '@/app/actions/boost'
import type { BoostIdea } from '@/lib/boost/ideas'
import type { BoostItem, BoostUpgrade } from '@/lib/boost/workspace'
import { EditorShell, FieldBlock } from './editor-shell'
import { ItemPicker } from './item-picker'
import { ItemSlot } from './item-slot'
import { UpgradePreview } from './previews'
import { peso } from './boost-model'
import type { EditorEnvironment } from './editor-types'

const DEFAULT_HEADER = 'Make it a meal?'
const MAX_TARGET_SUGGESTIONS = 5
const UPGRADE_WORDS = /\b(meal|combo|set|value|large|jumbo|upsize|family|double|big|xl|grande|venti|with|w)\b/i

function words(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** Bigger/meal versions of the item first, then pricier items in its category. */
function targetSuggestions(source: BoostItem | undefined, items: readonly BoostItem[]) {
  if (!source) return []
  const sourceWords = words(source.name)
  const scored = items
    .filter((item) => item.id !== source.id && item.price > source.price && item.isAvailable)
    .map((item) => {
      const itemWords = words(item.name)
      const containsSource = sourceWords.every((w) => itemWords.includes(w))
      if (containsSource && UPGRADE_WORDS.test(item.name)) return { item, score: 2, reason: 'Bigger version' }
      if (containsSource) return { item, score: 1.5, reason: 'Same dish, more' }
      if (item.categoryId && item.categoryId === source.categoryId) return { item, score: 1, reason: 'Same category' }
      return null
    })
    .filter((row): row is { item: BoostItem; score: number; reason: string } => row !== null)
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
  return scored.slice(0, MAX_TARGET_SUGGESTIONS).map((row) => ({ id: row.item.id, reason: row.reason }))
}

interface UpgradeEditorProps extends EditorEnvironment {
  upgrade: BoostUpgrade | null
  idea?: BoostIdea
  takenSourceIds: ReadonlySet<string>
}

type Picking = 'source' | 'target' | null

export function UpgradeEditor(props: UpgradeEditorProps) {
  const { upgrade, idea, takenSourceIds, tenantId, tenantSlug, items, itemsById, theme, onSaved, onClose } = props
  const initial = useMemo(() => ({
    sourceId: upgrade?.sourceId ?? (idea?.kind === 'upgrade' ? idea.sourceId : ''),
    targetId: upgrade?.targetId ?? (idea?.kind === 'upgrade' ? idea.targetId : ''),
    header: upgrade?.header ?? (idea?.kind === 'upgrade' ? idea.header : ''),
    sourceLabel: upgrade?.sourceLabel ?? '',
    targetLabel: upgrade?.targetLabel ?? '',
    isActive: upgrade?.isActive ?? true,
  }), [upgrade, idea])

  const [form, setForm] = useState(initial)
  const [picking, setPicking] = useState<Picking>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const source = itemsById.get(form.sourceId)
  const target = itemsById.get(form.targetId)
  const difference = source && target ? target.price - source.price : null
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  const suggestions = useMemo(() => targetSuggestions(source, items), [source, items])
  // Another upgrade already starts from these items; one per item keeps the page calm.
  const excludedSources = useMemo(
    () => [...takenSourceIds].filter((id) => id !== upgrade?.sourceId),
    [takenSourceIds, upgrade?.sourceId]
  )

  const handleSave = async () => {
    if (!source) return setError('Choose the item customers are looking at')
    if (!target) return setError('Choose what to offer instead')
    setError(null)
    setIsSaving(true)
    const response = await saveBoostUpgradeAction(tenantId, tenantSlug, {
      id: upgrade?.id,
      sourceId: form.sourceId,
      targetId: form.targetId,
      header: form.header || null,
      sourceLabel: form.sourceLabel || null,
      targetLabel: form.targetLabel || null,
      isActive: form.isActive,
    })
    setIsSaving(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    onSaved(upgrade ? 'Upgrade saved' : `${source.name} now offers ${target.name}`)
  }

  const handleDelete = async () => {
    if (!upgrade) return
    setIsDeleting(true)
    const response = await deleteBoostUpgradeAction(tenantId, tenantSlug, upgrade.id)
    setIsDeleting(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    onSaved('Upgrade deleted')
  }

  const overlay = picking ? (
    <ItemPicker
      items={items}
      mode="single"
      title={picking === 'source' ? 'Which item?' : 'Offer instead'}
      hint={picking === 'source' ? 'Customers see the upgrade on this item’s page' : `Something bigger or better than ${source?.name ?? 'it'}`}
      selectedIds={picking === 'source' ? [form.sourceId] : [form.targetId]}
      suggestions={picking === 'target' ? suggestions : []}
      excludeIds={picking === 'source' ? excludedSources : [form.sourceId]}
      onDone={([id]) => {
        if (picking === 'source') {
          update({ sourceId: id, targetId: id === form.targetId ? '' : form.targetId })
          // The next question is obvious — ask it straight away.
          setPicking(form.targetId && id !== form.targetId ? null : 'target')
        } else {
          update({ targetId: id })
          setPicking(null)
        }
        setError(null)
      }}
      onBack={() => setPicking(null)}
    />
  ) : undefined

  return (
    <EditorShell
      title={upgrade && source ? `${source.name} upgrade` : 'New upgrade'}
      subtitle="On the item page · a bigger or better version"
      preview={
        <UpgradePreview
          source={source}
          target={target}
          header={form.header || DEFAULT_HEADER}
          sourceLabel={form.sourceLabel}
          targetLabel={form.targetLabel}
          theme={theme}
        />
      }
      overlay={overlay}
      isLive={form.isActive}
      onLiveChange={(isActive) => update({ isActive })}
      isDirty={isDirty}
      isSaving={isSaving}
      saveLabel={upgrade ? 'Save' : 'Create upgrade'}
      onSave={handleSave}
      onDelete={upgrade ? handleDelete : undefined}
      isDeleting={isDeleting}
      onClose={onClose}
    >
      <FieldBlock title="When a customer is looking at" error={error ?? undefined}>
        <ItemSlot item={source} placeholder="Choose an item" onClick={() => setPicking('source')} />
      </FieldBlock>

      <div className="-my-4 flex justify-center text-muted-foreground" aria-hidden="true">
        <ArrowDown className="h-5 w-5" />
      </div>

      <FieldBlock title="Offer them">
        <ItemSlot
          item={target}
          placeholder={source ? 'Choose the bigger or meal version' : 'Choose the item first'}
          onClick={() => setPicking(source ? 'target' : 'source')}
          trailing={difference !== null && difference > 0 ? `+${peso(difference)}` : undefined}
        />
        {difference !== null && difference <= 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This costs the same or less, so the upgrade earns nothing extra.
          </p>
        )}
      </FieldBlock>

      <FieldBlock title="Wording" hint="Optional. Leave blank to use the item names.">
        <div className="space-y-3">
          <Input
            value={form.header}
            onChange={(event) => update({ header: event.target.value })}
            placeholder={DEFAULT_HEADER}
            maxLength={100}
            aria-label="Question customers see"
            className="h-11 text-base sm:text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={form.sourceLabel}
              onChange={(event) => update({ sourceLabel: event.target.value })}
              placeholder={source?.name ?? 'Just the item'}
              maxLength={50}
              aria-label="Label for the current item"
            />
            <Input
              value={form.targetLabel}
              onChange={(event) => update({ targetLabel: event.target.value })}
              placeholder={target?.name ?? 'The upgrade'}
              maxLength={50}
              aria-label="Label for the upgrade"
            />
          </div>
        </div>
      </FieldBlock>
    </EditorShell>
  )
}
