'use client'

/**
 * The row pieces every option list on the dish editor is built from — sizes,
 * choice options and add-ons all read the same way: name, price, and (for a
 * pick-one list) which option is pre-selected.
 */

import { useState, type ReactNode } from 'react'
import { ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useImageFilePicker } from '@/components/admin/menu-editor/use-image-file-picker'

/** A stack of option rows inside one bordered list. */
export function OptionList({ children }: { children: ReactNode }) {
  return <div className="divide-y overflow-hidden rounded-xl border bg-background">{children}</div>
}

interface OptionRowProps {
  name: string
  onNameChange: (name: string) => void
  /** Accessible name and placeholder for the name field, e.g. "Size name". */
  nameLabel: string
  namePlaceholder: string
  price: number
  onPriceChange: (price: number) => void
  priceLabel: string
  /** "+₱" for an extra charge on top of the dish, "₱" for an add-on's own price. */
  pricePrefix: string
  onRemove: () => void
  /** Pick-one lists only: whether this option starts selected. */
  isDefault?: boolean
  onToggleDefault?: () => void
  photo?: { url: string; onChange: (url: string) => void }
  /** Anything that belongs under the row, e.g. an add-on's recipe. */
  footer?: ReactNode
}

export function OptionRow({
  name,
  onNameChange,
  nameLabel,
  namePlaceholder,
  price,
  onPriceChange,
  priceLabel,
  pricePrefix,
  onRemove,
  isDefault,
  onToggleDefault,
  photo,
  footer,
}: OptionRowProps) {
  const displayName = name.trim() || 'this option'
  // "Size name" → "size", for an unnamed row's remove button.
  const rowNoun = nameLabel.replace(/ name$/i, '').toLowerCase()
  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {photo && <OptionPhotoButton url={photo.url} onChange={photo.onChange} optionName={displayName} />}
          <Input
            aria-label={nameLabel}
            placeholder={namePlaceholder}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="h-10 min-w-0 flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <PriceField
            value={price}
            onChange={onPriceChange}
            prefix={pricePrefix}
            label={`${priceLabel} for ${displayName}`}
          />
          {onToggleDefault && <DefaultToggle isDefault={Boolean(isDefault)} onToggle={onToggleDefault} />}
          <span className="flex-1 sm:hidden" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${name.trim() || `empty ${rowNoun}`}`}
            onClick={onRemove}
            className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {footer}
    </div>
  )
}

const toDraft = (value: number) => (Number.isFinite(value) && value !== 0 ? String(value) : '')
const fromDraft = (draft: string) => {
  const parsed = parseFloat(draft)
  return Number.isFinite(parsed) ? parsed : 0
}

interface PriceFieldProps {
  value: number
  onChange: (value: number) => void
  prefix: string
  label: string
}

/**
 * Keeps what the owner is typing ("0.", "") as text and hands the parent a
 * number. Binding the number straight to the input turned an emptied field
 * into NaN for add-ons and snapped "0." back to "0" for sizes.
 */
export function PriceField({ value, onChange, prefix, label }: PriceFieldProps) {
  const [draft, setDraft] = useState(() => toDraft(value))
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    if (fromDraft(draft) !== value) setDraft(toDraft(value))
  }

  return (
    <div className="relative w-28 shrink-0">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {prefix}
      </span>
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        aria-label={label}
        placeholder="0"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(fromDraft(e.target.value))
        }}
        className={cn('h-10 tabular-nums', prefix.length > 1 ? 'pl-9' : 'pl-7')}
      />
    </div>
  )
}

function DefaultToggle({ isDefault, onToggle }: { isDefault: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={isDefault}
      title="Pre-selected when a customer opens the dish"
      onClick={onToggle}
      className={cn(
        'h-10 w-[5.5rem] shrink-0 rounded-lg border text-center text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDefault
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-dashed text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      {isDefault ? 'Default ✓' : 'Default'}
    </button>
  )
}

interface OptionPhotoButtonProps {
  url: string
  onChange: (url: string) => void
  optionName: string
}

/** A small photo square in front of an option; tap to add or change it. */
function OptionPhotoButton({ url, onChange, optionName }: OptionPhotoButtonProps) {
  const { isConfigured, isUploading, pick, inputProps } = useImageFilePicker('variation-options', onChange)
  if (!isConfigured) return null

  return (
    <div className="relative shrink-0">
      <input {...inputProps} />
      <button
        type="button"
        onClick={pick}
        disabled={isUploading}
        aria-label={url ? `Change photo for ${optionName}` : `Add photo for ${optionName}`}
        title={url ? 'Change photo' : 'Add a photo (optional)'}
        className={cn(
          'flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !url && 'border-dashed',
        )}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-4 w-4" aria-hidden />
        )}
      </button>
      {url && !isUploading && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={`Remove photo for ${optionName}`}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** The full-width "+ Add …" row that ends a list. */
export function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}

interface StarterTileProps {
  icon: typeof Plus
  title: string
  example: string
  onClick: () => void
}

/** An empty section's way in: what it is, with an example. */
export function StarterTile({ icon: Icon, title, example, onClick }: StarterTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{example}</span>
      </span>
    </button>
  )
}
