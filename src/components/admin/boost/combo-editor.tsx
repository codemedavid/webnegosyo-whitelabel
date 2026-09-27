'use client'

import { useMemo, useRef, useState } from 'react'
import { ImagePlus, Loader2, Minus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { isImageKitConfigured, uploadImageToImageKit } from '@/lib/imagekit-upload'
import { deleteBoostComboAction, saveBoostComboAction } from '@/app/actions/boost'
import {
  comboDraftFromBundle,
  comboDraftFromIdea,
  comboDraftPrice,
  comboDraftRegularPrice,
  comboDraftToInput,
  emptyComboDraft,
  newPickKey,
  type ComboDraft,
  type ComboDraftErrors,
  type ComboPickDraft,
} from '@/lib/boost/combo-draft'
import { describeSavings, suggestComboPrice } from '@/lib/boost/pricing'
import type { BoostIdea } from '@/lib/boost/ideas'
import type { BundleWithSlots } from '@/lib/bundles-service'
import type { BoostItem } from '@/lib/boost/workspace'
import { EditorShell, FieldBlock } from './editor-shell'
import { ItemPicker } from './item-picker'
import { DishStack } from './dish'
import { ComboPreview } from './previews'
import { peso } from './boost-model'
import type { EditorEnvironment } from './editor-types'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
const MAX_PICK_COUNT = 10

const ROLE_LABELS: Record<string, string> = { main: 'Main', side: 'Side', drink: 'Drink', dessert: 'Dessert' }

/** "Drink" when every choice is a drink, the shared category otherwise. */
function labelForItems(items: readonly BoostItem[]): string {
  if (items.length === 1) return items[0].name
  const roles = new Set(items.map((item) => item.role))
  const [role] = [...roles]
  if (roles.size === 1 && ROLE_LABELS[role]) return ROLE_LABELS[role]
  const categories = new Set(items.map((item) => item.categoryName).filter(Boolean))
  if (categories.size === 1) return [...categories][0] as string
  return 'Your choice'
}

function suggestName(draft: ComboDraft, itemsById: ReadonlyMap<string, BoostItem>): string | null {
  const first = draft.picks.find((pick) => pick.itemIds.length === 1)
  const item = first ? itemsById.get(first.itemIds[0]) : undefined
  if (!item) return null
  return /\b(meal|combo|set)\b/i.test(item.name) ? `${item.name} Deal` : `${item.name} Meal`
}

interface ComboEditorProps extends EditorEnvironment {
  combo: BundleWithSlots | null
  idea?: BoostIdea
}

type PickerState = { mode: 'add' } | { mode: 'edit'; key: string } | null

export function ComboEditor(props: ComboEditorProps) {
  const { combo, idea, tenantId, tenantSlug, items, itemsById, theme, onSaved, onClose } = props
  const initial = useMemo<ComboDraft>(() => {
    if (combo) return comboDraftFromBundle(combo, items)
    if (idea?.kind === 'combo') return comboDraftFromIdea(idea)
    return emptyComboDraft()
  }, [combo, idea, items])

  const [draft, setDraft] = useState<ComboDraft>(initial)
  const [errors, setErrors] = useState<ComboDraftErrors>({})
  const [picker, setPicker] = useState<PickerState>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const regularPrice = comboDraftRegularPrice(draft, itemsById)
  const price = comboDraftPrice(draft, itemsById)
  const savings = price !== null ? describeSavings(regularPrice, price) : null
  const suggestedPrice = suggestComboPrice(regularPrice)
  const nameSuggestion = !draft.name.trim() ? suggestName(draft, itemsById) : null
  const previewItems = draft.picks
    .map((pick) => itemsById.get(pick.itemIds[0]))
    .filter((item): item is BoostItem => !!item)

  const update = (patch: Partial<ComboDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const updatePick = (key: string, patch: Partial<ComboPickDraft>) =>
    setDraft((current) => ({
      ...current,
      picks: current.picks.map((pick) => (pick.key === key ? { ...pick, ...patch } : pick)),
    }))

  const handlePicked = (ids: string[]) => {
    const chosen = ids.map((id) => itemsById.get(id)).filter((item): item is BoostItem => !!item)
    if (picker?.mode === 'add' && chosen.length > 0) {
      setDraft((current) => ({
        ...current,
        picks: [...current.picks, { key: newPickKey(), label: labelForItems(chosen), itemIds: ids, count: 1, surcharges: {} }],
      }))
    } else if (picker?.mode === 'edit') {
      const pick = draft.picks.find((p) => p.key === picker.key)
      const wasAutoLabel = pick && pick.label === labelForItems(pick.itemIds.map((id) => itemsById.get(id)).filter((i): i is BoostItem => !!i))
      updatePick(picker.key, {
        itemIds: ids,
        ...(wasAutoLabel ? { label: labelForItems(chosen) } : {}),
      })
    }
    setErrors((current) => ({ ...current, picks: undefined }))
    setPicker(null)
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!UPLOAD_TYPES.includes(file.type)) {
      toast.error('Use a PNG, JPG, WEBP or GIF photo.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('That photo is over 5 MB. Try a smaller one.')
      return
    }
    setIsUploading(true)
    try {
      const result = await uploadImageToImageKit(file, { folder: 'tenants' })
      update({ imageUrl: result.url })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The photo did not upload. Try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSave = async () => {
    const result = comboDraftToInput(draft, itemsById)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setIsSaving(true)
    const response = await saveBoostComboAction(tenantId, tenantSlug, combo?.id ?? null, result.input)
    setIsSaving(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    onSaved(combo ? 'Combo saved' : draft.isActive ? `${draft.name.trim()} is live on your menu` : 'Combo saved as paused')
  }

  const handleDelete = async () => {
    if (!combo) return
    setIsDeleting(true)
    const response = await deleteBoostComboAction(tenantId, tenantSlug, combo.id)
    setIsDeleting(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    onSaved('Combo deleted')
  }

  const editingPick = picker?.mode === 'edit' ? draft.picks.find((pick) => pick.key === picker.key) : undefined
  const overlay = picker ? (
    <ItemPicker
      items={items}
      mode="multi"
      title={picker.mode === 'add' ? 'Add to the combo' : 'Choices for this line'}
      hint="Pick one item, or several to let the customer choose"
      selectedIds={editingPick?.itemIds ?? []}
      onDone={handlePicked}
      onBack={() => setPicker(null)}
    />
  ) : undefined

  return (
    <EditorShell
      title={combo ? combo.name : 'New combo'}
      subtitle="On the menu · a set of items at one price"
      preview={
        <ComboPreview
          name={draft.name}
          items={previewItems}
          imageUrl={draft.imageUrl}
          price={price}
          regularPrice={regularPrice}
          theme={theme}
        />
      }
      overlay={overlay}
      isLive={draft.isActive}
      onLiveChange={(isActive) => update({ isActive })}
      isDirty={isDirty}
      isSaving={isSaving}
      saveLabel={combo ? 'Save' : 'Create combo'}
      onSave={handleSave}
      onDelete={combo ? handleDelete : undefined}
      isDeleting={isDeleting}
      onClose={onClose}
    >
      <FieldBlock title="What’s in it" hint="Each line is one thing the customer gets." error={errors.picks}>
        <ul className="space-y-2">
          {draft.picks.map((pick) => (
            <PickRow
              key={pick.key}
              pick={pick}
              itemsById={itemsById}
              onChange={(patch) => updatePick(pick.key, patch)}
              onEditItems={() => setPicker({ mode: 'edit', key: pick.key })}
              onRemove={() => update({ picks: draft.picks.filter((p) => p.key !== pick.key) })}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setPicker({ mode: 'add' })}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          {draft.picks.length === 0 ? 'Add the first item' : 'Add another item'}
        </button>
      </FieldBlock>

      <FieldBlock
        title="Price"
        error={errors.price}
        action={
          <button
            type="button"
            onClick={() => update({ priceMode: draft.priceMode === 'fixed' ? 'percent' : 'fixed' })}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {draft.priceMode === 'fixed' ? 'Use a % discount instead' : 'Set a price instead'}
          </button>
        }
      >
        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Ordered separately</span>
            <span className="tabular-nums">{peso(regularPrice)}</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="combo-price" className="flex-1 text-sm font-medium">
              {draft.priceMode === 'fixed' ? 'Combo price' : 'Discount'}
            </label>
            <div className="relative w-36">
              {draft.priceMode === 'fixed' && (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
              )}
              <Input
                id="combo-price"
                inputMode="decimal"
                value={draft.priceMode === 'fixed' ? draft.price : draft.percent}
                onChange={(event) =>
                  update(draft.priceMode === 'fixed' ? { price: event.target.value } : { percent: event.target.value })
                }
                placeholder={draft.priceMode === 'fixed' ? String(suggestedPrice || '') : '10'}
                className={cn('h-12 text-right text-lg font-semibold tabular-nums', draft.priceMode === 'fixed' ? 'pl-7' : 'pr-8')}
              />
              {draft.priceMode === 'percent' && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className={cn('text-sm', savings ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
              {savings
                ? `Customers save ${peso(savings.amount)} (${savings.percent}%)`
                : draft.picks.length === 0
                  ? 'Add items to see the saving'
                  : 'No saving yet'}
            </p>
            {draft.priceMode === 'fixed' && suggestedPrice > 0 && String(suggestedPrice) !== draft.price && (
              <button
                type="button"
                onClick={() => update({ price: String(suggestedPrice) })}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/70"
              >
                Use {peso(suggestedPrice)}
              </button>
            )}
          </div>
          {draft.priceMode === 'percent' && price !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Customers pay from {peso(price)} — the discount applies to whatever they choose.
            </p>
          )}
        </div>
      </FieldBlock>

      <FieldBlock title="Name and photo" error={errors.name}>
        <div className="space-y-3">
          <Input
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="e.g. Burger Meal"
            className="h-11 text-base sm:text-sm"
            aria-label="Combo name"
          />
          {nameSuggestion && (
            <button
              type="button"
              onClick={() => update({ name: nameSuggestion })}
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/70"
            >
              Use “{nameSuggestion}”
            </button>
          )}
          {isImageKitConfigured() && (
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept={UPLOAD_TYPES.join(',')} className="hidden" onChange={handleUpload} />
              {draft.imageUrl ? (
                <span className="relative h-16 w-16 overflow-hidden rounded-xl bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
                </span>
              ) : (
                <DishStack items={previewItems} size="md" />
              )}
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                {draft.imageUrl ? 'Your combo photo' : 'Optional — without one, the card uses its first item’s photo.'}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={isUploading}>
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
                {isUploading ? '' : draft.imageUrl ? 'Change' : 'Add photo'}
              </Button>
              {draft.imageUrl && (
                <Button type="button" variant="ghost" size="icon" onClick={() => update({ imageUrl: '' })} aria-label="Remove photo">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          <Textarea
            value={draft.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="A short line for the menu (optional)"
            rows={2}
            className="resize-none text-base sm:text-sm"
            aria-label="Description"
          />
        </div>
      </FieldBlock>

      <FieldBlock title="Where customers see it">
        <div className="divide-y rounded-2xl border">
          <ToggleRow
            label="On the menu"
            hint="Its own card in a Combos section at the top."
            checked={draft.showOnMenu}
            onChange={(showOnMenu) => update({ showOnMenu })}
          />
          <ToggleRow
            label="On its items’ pages"
            hint="Offered as “Make it a combo” when someone views an item in it."
            checked={draft.showAsSuggestion}
            onChange={(showAsSuggestion) => update({ showAsSuggestion })}
          />
        </div>
      </FieldBlock>
    </EditorShell>
  )
}

interface PickRowProps {
  pick: ComboPickDraft
  itemsById: ReadonlyMap<string, BoostItem>
  onChange: (patch: Partial<ComboPickDraft>) => void
  onEditItems: () => void
  onRemove: () => void
}

function PickRow({ pick, itemsById, onChange, onEditItems, onRemove }: PickRowProps) {
  const [showCharges, setShowCharges] = useState(Object.keys(pick.surcharges).length > 0)
  const choices = pick.itemIds.map((id) => itemsById.get(id)).filter((item): item is BoostItem => !!item)
  const isChoice = choices.length > 1
  const cheapest = choices.length ? Math.min(...choices.map((item) => item.price)) : 0

  return (
    <li className="rounded-2xl border p-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onEditItems} aria-label="Change items" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <DishStack items={choices} size="md" />
        </button>
        <div className="min-w-0 flex-1">
          <Input
            value={pick.label}
            onChange={(event) => onChange({ label: event.target.value })}
            aria-label="What customers see for this line"
            className="h-8 border-transparent px-1.5 text-sm font-semibold shadow-none hover:border-input focus-visible:border-input"
          />
          <button type="button" onClick={onEditItems} className="block truncate px-1.5 text-left text-xs text-muted-foreground hover:text-foreground">
            {isChoice
              ? `Customer chooses from ${choices.length} · from ${peso(cheapest)}`
              : choices[0]
                ? `${choices[0].name} · ${peso(choices[0].price)}`
                : 'Choose an item'}
          </button>
        </div>
        <div className="flex items-center rounded-full border" aria-label="How many">
          <button
            type="button"
            onClick={() => onChange({ count: Math.max(1, pick.count - 1) })}
            disabled={pick.count <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-30"
            aria-label="One fewer"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-5 text-center text-sm font-semibold tabular-nums">{pick.count}</span>
          <button
            type="button"
            onClick={() => onChange({ count: Math.min(MAX_PICK_COUNT, pick.count + 1) })}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            aria-label="One more"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${pick.label}`}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isChoice && (
        <div className="mt-2 pl-[3.75rem]">
          <button
            type="button"
            onClick={() => setShowCharges((open) => !open)}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {showCharges ? 'Hide extra charges' : 'Charge extra for some choices'}
          </button>
          {showCharges && (
            <ul className="mt-2 space-y-1.5">
              {choices.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground">+₱</span>
                  <Input
                    inputMode="decimal"
                    value={pick.surcharges[item.id] ? String(pick.surcharges[item.id]) : ''}
                    placeholder="0"
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      const next = { ...pick.surcharges }
                      if (Number.isFinite(value) && value > 0) next[item.id] = value
                      else delete next[item.id]
                      onChange({ surcharges: next })
                    }}
                    className="h-8 w-20 text-right tabular-nums"
                    aria-label={`Extra charge for ${item.name}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

interface ToggleRowProps {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}
