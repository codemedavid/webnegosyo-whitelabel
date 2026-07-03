'use client'

/**
 * Branding Studio field renderers — one row per registry field type.
 * Pure presentation: values and inherit metadata are resolved by the parent
 * via the branding-registry cascade helpers.
 */

import { useState } from 'react'
import type { BrandingField } from '@/lib/branding-registry'

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
    case 'note':
      return <NoteRow {...props} />
    default:
      return null
  }
}
