'use client'

import { useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { saveBoostLastCallAction } from '@/app/actions/boost'
import type { BoostItem, BoostLastCall } from '@/lib/boost/workspace'
import { EditorShell, FieldBlock } from './editor-shell'
import { ItemPicker } from './item-picker'
import { ItemsSlot } from './item-slot'
import { LastCallPreview } from './previews'
import type { EditorEnvironment } from './editor-types'

const MIN_SHOWN = 2
const MAX_SHOWN = 8
const DEFAULT_TITLE = 'Add to your order'
const QUICK_ADD_ROLES = new Set(['drink', 'dessert', 'side'])

interface LastCallEditorProps extends EditorEnvironment {
  lastCall: BoostLastCall
}

export function LastCallEditor(props: LastCallEditorProps) {
  const { lastCall, tenantId, tenantSlug, items, itemsById, cartTheme, onSaved, onClose } = props
  const initial = useMemo(() => ({
    enabled: lastCall.enabled,
    title: lastCall.title || DEFAULT_TITLE,
    subtitle: lastCall.subtitle,
    maxItems: Math.min(MAX_SHOWN, Math.max(MIN_SHOWN, lastCall.maxItems)),
    isAutomatic: lastCall.pickedItemIds.length === 0,
    pickedItemIds: lastCall.pickedItemIds,
  }), [lastCall])

  const [form, setForm] = useState(initial)
  const [isPicking, setPicking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  // Automatic picks depend on each cart; preview with the quick add-ons it falls back to.
  const previewItems = useMemo(() => {
    const pool = form.isAutomatic
      ? items.filter((item) => QUICK_ADD_ROLES.has(item.role) && item.isAvailable)
      : form.pickedItemIds.map((id) => itemsById.get(id)).filter((item): item is BoostItem => !!item)
    return pool.slice(0, form.maxItems)
  }, [form.isAutomatic, form.pickedItemIds, form.maxItems, items, itemsById])

  const handleSave = async () => {
    if (!form.isAutomatic && form.pickedItemIds.length === 0) {
      setError('Choose the items to show, or switch to automatic')
      return
    }
    setError(null)
    setIsSaving(true)
    const response = await saveBoostLastCallAction(tenantId, tenantSlug, {
      enabled: form.enabled,
      title: form.title.trim() || DEFAULT_TITLE,
      subtitle: form.subtitle.trim(),
      maxItems: form.maxItems,
      pickedItemIds: form.isAutomatic ? [] : form.pickedItemIds,
    })
    setIsSaving(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    onSaved(form.enabled ? 'Your cart now suggests add-ons' : 'Cart suggestions saved as paused')
  }

  const overlay = isPicking ? (
    <ItemPicker
      items={items}
      mode="multi"
      title="Show in the cart"
      hint="Quick, easy additions work best: drinks, desserts, sides"
      selectedIds={form.pickedItemIds}
      onDone={(ids) => {
        update({ pickedItemIds: ids })
        setPicking(false)
        setError(null)
      }}
      onBack={() => setPicking(false)}
    />
  ) : undefined

  return (
    <EditorShell
      title="Last call"
      subtitle="In the cart · quick add-ons before checkout"
      preview={
        <LastCallPreview
          title={form.title}
          subtitle={form.subtitle}
          items={previewItems}
          theme={cartTheme}
          isAutomatic={form.isAutomatic}
        />
      }
      overlay={overlay}
      isLive={form.enabled}
      onLiveChange={(enabled) => update({ enabled })}
      isDirty={isDirty}
      isSaving={isSaving}
      saveLabel="Save"
      onSave={handleSave}
      onClose={onClose}
    >
      <FieldBlock title="What to show" error={error ?? undefined}>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How items are chosen">
          {[
            { value: true, title: 'Automatic', body: 'Each cart gets its own: what pairs with its items, then drinks, desserts and sides.' },
            { value: false, title: 'I’ll choose', body: 'The same items for every cart, in your order.' },
          ].map((option) => (
            <button
              key={option.title}
              type="button"
              role="radio"
              aria-checked={form.isAutomatic === option.value}
              onClick={() => update({ isAutomatic: option.value })}
              className={cn(
                'rounded-2xl border-2 p-4 text-left transition-colors',
                form.isAutomatic === option.value ? 'border-foreground' : 'border-border hover:border-foreground/30'
              )}
            >
              <span className="block text-sm font-semibold">{option.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{option.body}</span>
            </button>
          ))}
        </div>
        {!form.isAutomatic && (
          <ItemsSlot ids={form.pickedItemIds} itemsById={itemsById} placeholder="Choose items" onClick={() => setPicking(true)} />
        )}
      </FieldBlock>

      <FieldBlock title="Wording">
        <div className="space-y-3">
          <Input
            value={form.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder={DEFAULT_TITLE}
            maxLength={100}
            aria-label="Headline"
            className="h-11 text-base sm:text-sm"
          />
          <Input
            value={form.subtitle}
            onChange={(event) => update({ subtitle: event.target.value })}
            placeholder="A short line under it (optional)"
            maxLength={200}
            aria-label="Line under the headline"
          />
        </div>
      </FieldBlock>

      <FieldBlock title="How many to show">
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-full border">
            <button
              type="button"
              onClick={() => update({ maxItems: Math.max(MIN_SHOWN, form.maxItems - 1) })}
              disabled={form.maxItems <= MIN_SHOWN}
              className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
              aria-label="Show fewer"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center font-semibold tabular-nums">{form.maxItems}</span>
            <button
              type="button"
              onClick={() => update({ maxItems: Math.min(MAX_SHOWN, form.maxItems + 1) })}
              disabled={form.maxItems >= MAX_SHOWN}
              className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
              aria-label="Show more"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Items already in the cart are never suggested.</p>
        </div>
      </FieldBlock>
    </EditorShell>
  )
}
