'use client'

/**
 * The part style controls (parts.ts): every part of a block — its card, its
 * wording, the chosen and not-chosen options, the form boxes, the buttons —
 * with each of its colours and shapes. Blank = follow the level above (the
 * page style, then the Look tab / Branding Studio). Used for one block on the
 * Style tab and for the whole page on the Look tab.
 */

import { ChevronDown, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { isValidPartValue, partKey, PART_PROPS, QUICK_STYLES, type PartDef, type QuickStyle } from '@/lib/page-designer/parts'

type Values = Readonly<Record<string, unknown>>

interface PartStyleEditorProps {
  parts: readonly PartDef[]
  values: Values
  /** '' clears the key. */
  onChange: (key: string, value: string) => void
  /** Values from the level above (the page style), shown while a key is blank. */
  inherited?: Values
  /** "Page style" / "Look tab" — what a blank value follows. */
  followsLabel: string
}

const HEX6 = /^#[0-9a-f]{6}$/i

function SwatchRow({ label, value, inherited, followsLabel, onChange }: { label: string; value: string; inherited?: string; followsLabel: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const isSet = value !== ''
  const shown = isSet ? value : inherited
  return (
    <div className="flex min-h-[30px] items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium leading-tight text-neutral-800">{label}</div>
        {!isSet && <div className="text-[10.5px] text-neutral-500">{inherited ? `Page style · ${inherited}` : `Follows ${followsLabel}`}</div>}
      </div>
      {isSet && (
        <input
          aria-label={`${label} hex`}
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft === null) return
            const next = draft.trim()
            if (next === '' || /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(next)) onChange(next.toLowerCase())
            setDraft(null)
          }}
          className="w-[76px] rounded border border-neutral-200 px-1.5 py-1 font-mono text-[11px] text-neutral-700"
        />
      )}
      {isSet && (
        <button type="button" onClick={() => onChange('')} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" title={`Follow ${followsLabel}`} aria-label={`${label}: follow ${followsLabel}`}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      <label
        className={cn(
          'relative h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md',
          isSet ? 'ring-2 ring-neutral-800' : 'border-[1.5px] border-dashed border-neutral-300 bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:8px_8px]',
        )}
      >
        {shown && <span className={cn('absolute inset-0', !isSet && 'opacity-60')} style={{ background: shown }} />}
        <input
          type="color"
          value={shown && HEX6.test(shown) ? shown : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

function ChoiceRow({ propId, value, inherited, onChange }: { propId: string; value: string; inherited?: string; onChange: (v: string) => void }) {
  const prop = PART_PROPS[propId]
  const choices = prop.choices ?? []
  const inheritedLabel = choices.find((c) => c.value === inherited)?.label
  if (choices.length <= 4) {
    return (
      <div>
        <div className="mb-1 text-[12px] font-medium text-neutral-800">{prop.label}</div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={prop.label}>
          <ChoiceChip label={inheritedLabel ? `Page (${inheritedLabel})` : 'Standard'} isOn={value === ''} onClick={() => onChange('')} />
          {choices.map((choice) => (
            <ChoiceChip key={choice.value} label={choice.label} isOn={value === choice.value} onClick={() => onChange(choice.value)} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <label className="flex items-center gap-2">
      <span className="flex-1 text-[12px] font-medium text-neutral-800">{prop.label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 max-w-[150px] rounded-md border border-neutral-200 bg-white px-1.5 text-[11.5px] text-neutral-800"
      >
        <option value="">{inheritedLabel ? `Page (${inheritedLabel})` : 'Standard'}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ChoiceChip({ label, isOn, onClick }: { label: string; isOn: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isOn}
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1 text-[11px] font-semibold transition',
        isOn ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-600 hover:border-neutral-400',
      )}
    >
      {label}
    </button>
  )
}

const str = (values: Values | undefined, key: string): string => {
  const value = values?.[key]
  return typeof value === 'string' && isValidPartValue(key, value) ? value : ''
}

function PartCard({ part, values, inherited, followsLabel, onChange }: { part: PartDef } & Omit<PartStyleEditorProps, 'parts'>) {
  const [isOpen, setOpen] = useState(false)
  const setCount = part.props.filter((prop) => str(values, partKey(part.id, prop)) !== '').length
  return (
    <div className="rounded-lg border border-neutral-200">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <span className="flex-1 text-[12px] font-semibold text-neutral-800">{part.label}</span>
        {setCount > 0 && <span className="rounded-full bg-sky-100 px-1.5 text-[10px] font-bold text-sky-800">{setCount}</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 text-neutral-400 transition-transform', isOpen ? '' : '-rotate-90')} />
      </button>
      {isOpen && (
        <div className="space-y-2.5 border-t border-neutral-100 px-2.5 pb-3 pt-2">
          {part.hint && <p className="text-[10.5px] leading-snug text-neutral-500">{part.hint}</p>}
          {part.props.map((propId) => {
            const key = partKey(part.id, propId)
            const prop = PART_PROPS[propId]
            return prop.kind === 'color' ? (
              <SwatchRow key={key} label={prop.label} value={str(values, key)} inherited={str(inherited, key) || undefined} followsLabel={followsLabel} onChange={(v) => onChange(key, v)} />
            ) : (
              <ChoiceRow key={key} propId={propId} value={str(values, key)} inherited={str(inherited, key) || undefined} onChange={(v) => onChange(key, v)} />
            )
          })}
          {setCount > 0 && (
            <button
              type="button"
              onClick={() => part.props.forEach((prop) => onChange(partKey(part.id, prop), ''))}
              className="flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline"
            >
              <RotateCcw className="h-3 w-3" /> Reset {part.label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Every part, grouped (Box, Text, Choices, Form, Buttons, Details, Progress). */
export function PartStyleEditor({ parts, values, inherited, followsLabel, onChange }: PartStyleEditorProps) {
  const groups = [...new Set(parts.map((p) => p.group))]
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-400">{group}</p>
          <div className="space-y-1.5">
            {parts
              .filter((p) => p.group === group)
              .map((part) => (
                <PartCard key={part.id} part={part} values={values} inherited={inherited} followsLabel={followsLabel} onChange={onChange} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** One-tap starting styles. */
export function QuickStyles({ onPick }: { onPick: (style: QuickStyle) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {QUICK_STYLES.map((style) => (
        <button
          key={style.id}
          type="button"
          onClick={() => onPick(style)}
          className="rounded-lg border border-neutral-200 px-2 py-2 text-[11px] font-semibold text-neutral-700 hover:border-neutral-900 hover:text-neutral-900"
        >
          {style.label}
        </button>
      ))}
    </div>
  )
}
