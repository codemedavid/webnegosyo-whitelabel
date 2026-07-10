'use client'

/**
 * Branding Studio field renderers — one row per registry field type.
 * Pure presentation: values and inherit metadata are resolved by the parent
 * via the branding-registry cascade helpers.
 */

import { useState } from 'react'
import type { BrandingField } from '@/lib/branding-registry'
import type { PromotionBanner } from '@/types/database'
import { ImageUpload } from '@/components/shared/image-upload'

export interface FieldRowProps {
  field: BrandingField
  /** Resolved value through the draft→tenant→inherit→default cascade. */
  value: unknown
  /** True when the field holds an explicit (draft or saved) value. */
  isSet: boolean
  /** Label of the inherit source shown under unset color fields. */
  inheritLabel: string
  onChange: (value: unknown) => void
  onClear: () => void
  /** Options for `product`-type fields (the tenant's own menu items). */
  productOptions?: readonly { value: string; label: string }[]
}

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function toPickerHex(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value : '#000000'
}

function ColorRow({ field, value, isSet, inheritLabel, onChange, onClear }: FieldRowProps) {
  const hex = toPickerHex(value)
  return (
    <div className="flex min-h-[30px] items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold leading-tight">{field.label}</div>
        {!isSet && field.inheritsFrom && (
          <div className="mt-0.5 text-[10.5px] text-neutral-400">↳ Inherits · {inheritLabel}</div>
        )}
      </div>
      {isSet && (
        <button
          type="button"
          onClick={onClear}
          className="p-0.5 text-[10.5px] font-bold text-neutral-400 underline hover:text-neutral-800"
        >
          Reset
        </button>
      )}
      <span className="font-mono text-[10.5px] text-neutral-400">
        {typeof value === 'string' && value ? value : ''}
      </span>
      <label
        className={`relative h-6 w-9 flex-shrink-0 cursor-pointer overflow-hidden rounded-md ${
          isSet ? 'ring-2 ring-neutral-800' : 'border-[1.5px] border-dashed border-neutral-300'
        }`}
      >
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={field.label}
          className="absolute -inset-2 h-12 w-14 cursor-pointer border-none p-0"
        />
      </label>
    </div>
  )
}

function ToggleRow({ field, value, onChange }: FieldRowProps) {
  const isOn = value === true
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 text-[12.5px] font-semibold">{field.label}</div>
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-label={field.label}
        onClick={() => onChange(!isOn)}
        className={`relative h-[22px] w-[37px] flex-shrink-0 rounded-full transition-colors ${
          isOn ? 'bg-emerald-700' : 'bg-neutral-300'
        }`}
      >
        <span
          className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all"
          style={{ left: isOn ? 18 : 3 }}
        />
      </button>
    </div>
  )
}

function SelectRow({ field, value, onChange }: FieldRowProps) {
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-semibold">{field.label}</div>
      <div className="flex flex-wrap gap-1.5">
        {(field.options ?? []).map((option) => {
          const isActive = value === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] font-bold capitalize transition-colors ${
                isActive
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-transparent text-neutral-500 hover:border-neutral-400'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TextRow({ field, value, onChange }: FieldRowProps) {
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-semibold">{field.label}</div>
      <input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        aria-label={field.label}
        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12.5px] outline-none focus:border-neutral-800"
      />
    </div>
  )
}

function NumberRow({ field, value, onChange }: FieldRowProps) {
  const [rawInput, setRawInput] = useState<string | null>(null)
  const shownValue = rawInput ?? (typeof value === 'number' ? String(value) : '')
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 text-[12.5px] font-semibold">{field.label}</div>
      <input
        type="number"
        value={shownValue}
        min={field.min}
        max={field.max}
        aria-label={field.label}
        onChange={(e) => {
          setRawInput(e.target.value)
          const parsed = Number(e.target.value)
          if (!Number.isNaN(parsed) && e.target.value !== '') onChange(parsed)
        }}
        onBlur={() => setRawInput(null)}
        className="w-20 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[12.5px] outline-none focus:border-neutral-800"
      />
    </div>
  )
}

function ProductRow({ field, value, onChange, productOptions = [] }: FieldRowProps) {
  const selected = typeof value === 'string' ? value : ''
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-semibold">{field.label}</div>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.label}
        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12.5px] outline-none focus:border-neutral-800"
      >
        <option value="">None</option>
        {productOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function newBannerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `banner-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

/**
 * Inline promotion-banner manager. Renders one editable block per banner
 * (image upload, title, description) plus add / remove / reorder controls.
 * Every mutation emits a brand-new array (immutable) so the parent draft, the
 * live preview, and publish all stay in sync.
 */
function BannersRow({ field, value, onChange }: FieldRowProps) {
  const list: PromotionBanner[] = Array.isArray(value) ? (value as PromotionBanner[]) : []

  const update = (index: number, patch: Partial<PromotionBanner>) => {
    onChange(list.map((banner, i) => (i === index ? { ...banner, ...patch } : banner)))
  }
  const remove = (index: number) => {
    onChange(list.filter((_, i) => i !== index))
  }
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const add = () => {
    onChange([...list, { id: newBannerId(), imageUrl: '' }])
  }

  return (
    <div>
      <div className="mb-2 text-[12.5px] font-semibold">{field.label}</div>
      <div className="flex flex-col gap-3">
        {list.map((banner, index) => (
          <div key={banner.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-bold text-neutral-400">#{index + 1}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Move up"
                className="px-1 text-[12px] text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === list.length - 1}
                aria-label="Move down"
                className="px-1 text-[12px] text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="Remove banner"
                className="px-1 text-[11px] font-bold text-red-500 underline hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <ImageUpload
              currentImageUrl={banner.imageUrl}
              onImageUploaded={(url) => update(index, { imageUrl: url })}
              folder="promotion-banners"
              label="Banner image"
            />
            <input
              value={banner.title ?? ''}
              onChange={(e) => update(index, { title: e.target.value })}
              placeholder="Title (optional)"
              aria-label={`Banner ${index + 1} title`}
              className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-neutral-800"
            />
            <input
              value={banner.description ?? ''}
              onChange={(e) => update(index, { description: e.target.value })}
              placeholder="Description (optional)"
              aria-label={`Banner ${index + 1} description`}
              className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-neutral-800"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-3 w-full rounded-lg border border-dashed border-neutral-300 py-2 text-[12px] font-bold text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
      >
        + Add banner
      </button>
    </div>
  )
}

function NoteRow({ field }: FieldRowProps) {
  return (
    <div className="rounded-lg bg-neutral-100 px-2.5 py-2 text-[11px] leading-relaxed text-neutral-500">
      {field.label}
    </div>
  )
}

export function FieldRow(props: FieldRowProps) {
  switch (props.field.type) {
    case 'color':
      return <ColorRow {...props} />
    case 'toggle':
      return <ToggleRow {...props} />
    case 'select':
      return <SelectRow {...props} />
    case 'text':
      return <TextRow {...props} />
    case 'number':
      return <NumberRow {...props} />
    case 'product':
      return <ProductRow {...props} />
    case 'banners':
      return <BannersRow {...props} />
    case 'note':
      return <NoteRow {...props} />
    default:
      return null
  }
}
