'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Link2, Link2Off, Loader2, RotateCcw, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { THEME_COLOR_KEYS, THEME_COLOR_LABELS } from '@/lib/hero-builder/constants'
import { isSafeColor } from '@/lib/hero-builder/safe-values'
import type { Box } from '@/lib/hero-builder/types'
import { isImageKitConfigured, uploadImageToImageKit } from '@/lib/imagekit-upload'

import { HERO_ICON_NAMES, HeroIcon } from '../icons'

// ── Layout ──────────────────────────────────────────────────────────────────

export function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-neutral-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-900"
      >
        {title}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  )
}

interface FieldProps {
  label: string
  /** Set on tablet/mobile when this device overrides the inherited value. */
  isOverridden?: boolean
  onReset?: () => void
  hint?: string
  children: ReactNode
  inline?: boolean
}

export function Field({ label, isOverridden, onReset, hint, children, inline }: FieldProps) {
  return (
    <div className={cn(inline ? 'flex items-center justify-between gap-3' : 'space-y-1.5')}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-neutral-700">{label}</span>
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            title="Overridden on this device — click to inherit again"
            className="group inline-flex items-center gap-1 rounded px-1 text-[10px] font-semibold text-sky-700 hover:bg-sky-50"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            <RotateCcw className="hidden h-3 w-3 group-hover:block" />
          </button>
        )}
      </div>
      {children}
      {hint && <p className="text-[11px] leading-snug text-neutral-500">{hint}</p>}
    </div>
  )
}

const inputClass =
  'h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-md border border-neutral-200 bg-white p-2 text-xs leading-relaxed text-neutral-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20',
        props.className,
      )}
    />
  )
}

// ── Numbers ─────────────────────────────────────────────────────────────────

interface NumberFieldProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min: number
  max: number
  step?: number
  unit?: string
  placeholder?: string
  /** Show a range slider next to the input. */
  slider?: boolean
}

export function NumberField({ value, onChange, min, max, step = 1, unit, placeholder, slider = true }: NumberFieldProps) {
  // While typing, a half-entered value ("1" on the way to "16") must not be
  // clamped. Commit live only when in range; clamp on blur / Enter.
  const [draft, setDraft] = useState<string | null>(null)
  const typed = (raw: string) => {
    setDraft(raw)
    if (raw.trim() === '') return onChange(undefined)
    const n = Number(raw)
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n)
  }
  const settle = () => {
    if (draft === null) return
    const n = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
    setDraft(null)
  }
  return (
    <div className="flex items-center gap-2">
      {slider && (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-sky-600"
          aria-label="Adjust value"
        />
      )}
      <div className={cn('relative', slider ? 'w-[72px] shrink-0' : 'w-full')}>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft ?? value ?? ''}
          placeholder={placeholder}
          onChange={(e) => typed(e.target.value)}
          onBlur={settle}
          onKeyDown={(e) => e.key === 'Enter' && settle()}
          className={cn(inputClass, unit ? 'pr-7' : '')}
        />
        {unit && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400">{unit}</span>}
      </div>
    </div>
  )
}

// ── Choices ─────────────────────────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  value: T | undefined
  onChange: (value: T) => void
  options: readonly { value: T; label: string; icon?: ReactNode }[]
}

export function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" className="flex rounded-md bg-neutral-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-medium transition',
            value === o.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800',
          )}
        >
          {o.icon ?? o.label}
        </button>
      ))}
    </div>
  )
}

interface SelectFieldProps<T extends string> {
  value: T | undefined
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  placeholder?: string
}

export function SelectField<T extends string>({ value, onChange, options, placeholder }: SelectFieldProps<T>) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value as T)} className={cn(inputClass, 'cursor-pointer')}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-neutral-700">
      <span className="font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-sky-600' : 'bg-neutral-300')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

// ── Color ───────────────────────────────────────────────────────────────────

function swatchBackground(value: string | undefined): string {
  if (!value) return 'transparent'
  const ref = /^@([a-z]+)$/.exec(value)
  return ref ? `var(--hb-${ref[1]})` : value
}

interface ColorFieldProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
  /** Theme colors can't reference themselves. */
  allowThemeRefs?: boolean
}

export function ColorField({ value, onChange, allowThemeRefs = true }: ColorFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const hex = value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label
          className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-neutral-200 bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:8px_8px]"
          title="Pick a color"
        >
          <span className="absolute inset-0" style={{ background: swatchBackground(value) }} />
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Color picker"
          />
        </label>
        <input
          value={draft ?? value ?? ''}
          placeholder="Inherit"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft === null) return
            const next = draft.trim()
            if (next === '') onChange(undefined)
            else if (isSafeColor(next)) onChange(next)
            else toast.error('Use a hex (#ff6600), rgb() or hsl() color')
            setDraft(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={inputClass}
          aria-label="Color value"
        />
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className="text-neutral-400 hover:text-neutral-700" title="Clear">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {allowThemeRefs && (
        <div className="flex flex-wrap gap-1">
          {THEME_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              title={`Theme: ${THEME_COLOR_LABELS[key]}`}
              onClick={() => onChange(`@${key}`)}
              className={cn(
                'h-5 w-5 rounded-full border border-black/10 ring-offset-1 transition hover:scale-110',
                value === `@${key}` && 'ring-2 ring-sky-500',
              )}
              style={{ background: `var(--hb-${key})` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Spacing box ─────────────────────────────────────────────────────────────

const SIDES = ['top', 'right', 'bottom', 'left'] as const

export function BoxField({ value, onChange, min = 0, max = 400 }: { value: Box | undefined; onChange: (v: Box) => void; min?: number; max?: number }) {
  const box = value ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const [linked, setLinked] = useState(box.top === box.right && box.right === box.bottom && box.bottom === box.left)
  // Per-side typing buffer: a lone "-" (on the way to "-12") must not snap to 0.
  const [draft, setDraft] = useState<{ side: (typeof SIDES)[number]; raw: string } | null>(null)
  const commit = (side: (typeof SIDES)[number], raw: string, final: boolean) => {
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) {
      if (final) setDraft(null)
      return
    }
    if (!final && (n < min || n > max)) return
    const v = Math.min(max, Math.max(min, n))
    onChange(linked ? { top: v, right: v, bottom: v, left: v } : { ...box, [side]: v })
    if (final) setDraft(null)
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="grid flex-1 grid-cols-4 gap-1">
        {SIDES.map((side) => (
          <label key={side} className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={draft?.side === side ? draft.raw : String(box[side])}
              onChange={(e) => {
                setDraft({ side, raw: e.target.value })
                commit(side, e.target.value, false)
              }}
              onBlur={(e) => commit(side, e.target.value, true)}
              onKeyDown={(e) => e.key === 'Enter' && commit(side, (e.target as HTMLInputElement).value, true)}
              className={cn(inputClass, 'px-1 pt-3 text-center')}
              aria-label={`${side} spacing`}
            />
            <span className="pointer-events-none absolute left-0 right-0 top-0.5 text-center text-[8px] uppercase tracking-wide text-neutral-400">
              {side[0]}
            </span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setLinked((l) => !l)}
        title={linked ? 'Edit sides separately' : 'Link all sides'}
        className={cn('flex h-8 w-7 items-center justify-center rounded-md border', linked ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-neutral-200 text-neutral-400')}
      >
        {linked ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ── Image ───────────────────────────────────────────────────────────────────

export function ImageField({ value, onChange }: { value: string | undefined; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file (JPG, PNG, WEBP or GIF).')
    if (file.size > 5 * 1024 * 1024) return toast.error('Images must be 5 MB or smaller.')
    if (!isImageKitConfigured()) return toast.error('Image upload is not configured — paste an image URL instead.')
    setProgress(0)
    try {
      const result = await uploadImageToImageKit(file, { folder: 'tenants/hero', onProgress: setProgress })
      onChange(result.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed. Please try again.')
    } finally {
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="group relative overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
          {/* eslint-disable-next-line @next/next/no-img-element -- merchant URL preview */}
          <img src={value} alt="" className="h-28 w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
            title="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <input
          value={value ?? ''}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value.trim())}
          className={inputClass}
          aria-label="Image URL"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={progress !== null}
          className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {progress !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {progress !== null ? `${Math.round(progress)}%` : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
    </div>
  )
}

// ── Icon ────────────────────────────────────────────────────────────────────

export function IconPicker({ value, onChange, allowNone }: { value: string | undefined; onChange: (v: string | undefined) => void; allowNone?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const names = HERO_ICON_NAMES.filter((n) => n.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(inputClass, 'flex items-center gap-2 text-left')}
      >
        {value ? <HeroIcon name={value} className="h-4 w-4" /> : <span className="h-4 w-4" />}
        <span className="flex-1 truncate">{value || 'No icon'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
      </button>
      {open && (
        <div className="rounded-md border border-neutral-200 bg-white p-2 shadow-sm">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search icons" className={cn(inputClass, 'mb-2')} autoFocus />
          <div className="grid max-h-44 grid-cols-7 gap-1 overflow-y-auto">
            {allowNone && (
              <button type="button" onClick={() => { onChange(undefined); setOpen(false) }} className="flex h-8 items-center justify-center rounded text-[10px] text-neutral-500 hover:bg-neutral-100">
                None
              </button>
            )}
            {names.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => { onChange(name); setOpen(false) }}
                className={cn('flex h-8 items-center justify-center rounded hover:bg-neutral-100', value === name && 'bg-sky-50 text-sky-700')}
              >
                <HeroIcon name={name} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
