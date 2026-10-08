'use client'

/*
 * DIRECTION — merchant set-up (/onboarding/[token])
 * THESIS: a quiet white studio whose only color is the one the owner gives it.
 *   The setup starts in ink and takes on their brand the moment they pick it;
 *   the phone showing their store is the hero. Refuses the cream-card wall.
 * OWN-WORLD: white ground, warm ink (#17130F), one hairline gray, Figtree only
 *   (the Baloo wordmark stays in the header), 12px radii, 1px → 2px selection
 *   borders, lucide icons at 1.75 stroke. Accent = --ob-accent (ink until a brand).
 * STORY: one question per screen → watch the store being built → it opens →
 *   a short setup guide for the first week.
 * FIRST VIEWPORT: question column left, brand-tinted panel with the phone right;
 *   on phones the question fills the screen and a fixed bar carries Back / Next.
 * FORM: canon (user-pinned): Airbnb host flow, Shopify setup guide, Stripe restraint.
 */

import { useRef, useState } from 'react'
import { Camera, Check, Loader2, X } from 'lucide-react'
import { shrinkPhoto } from './shrink-photo'

/** The set-up pages' neutrals. Color comes only from the merchant's accent. */
export const OB = {
  ink: '#17130F',
  /** Secondary text: 7.4:1 on white. */
  muted: '#5C544D',
  /** Placeholder / tertiary text: 4.7:1 on white. */
  faint: '#776F68',
  line: '#E9E5E0',
  lineStrong: '#D3CCC4',
  wash: '#F6F4F1',
  canvas: '#FFFFFF',
} as const

export const ACCENT = 'var(--ob-accent, #17130F)'
export const ACCENT_INK = 'var(--ob-accent-ink, #FFFFFF)'
export const ACCENT_SOFT = 'var(--ob-accent-soft, #F6F4F1)'

export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ob-accent,#17130F)] focus-visible:ring-offset-2'

export function StepHeading({ title, lede, as: Tag = 'h1' }: { title: React.ReactNode; lede?: React.ReactNode; as?: 'h1' | 'h2' }) {
  return (
    <div>
      <Tag tabIndex={-1} className="text-balance text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.025em] sm:text-[2.25rem]" style={{ color: OB.ink }}>
        {title}
      </Tag>
      {lede && <p className="mt-2 max-w-[34rem] text-pretty text-base leading-relaxed" style={{ color: OB.muted }}>{lede}</p>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[15px] font-semibold" style={{ color: OB.ink }}>{label}</span>
      {hint && <span className="mt-0.5 block text-[13px] leading-relaxed" style={{ color: OB.muted }}>{hint}</span>}
      <span className="mt-2.5 block">{children}</span>
    </label>
  )
}

/** 16px text: anything smaller makes iOS zoom the page on focus. */
export const INPUT_CLASS =
  'w-full rounded-xl border border-[#D3CCC4] bg-white px-4 py-3.5 text-base text-[#17130F] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#776F68] hover:border-[#A9A098] focus:border-[var(--ob-accent,#17130F)] focus:shadow-[0_0_0_1px_var(--ob-accent,#17130F)]'

export function GroupLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-[15px] font-semibold" style={{ color: OB.ink }}>{children}</p>
      {hint && <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: OB.muted }}>{hint}</p>}
    </div>
  )
}

interface OptionProps {
  isSelected: boolean
  onClick: () => void
  title: string
  description?: string
  icon?: React.ReactNode
  /** Checkbox semantics (many may be on) instead of a single choice. */
  isMulti?: boolean
}

function selectionStyle(isSelected: boolean): React.CSSProperties {
  return {
    borderColor: isSelected ? ACCENT : OB.lineStrong,
    boxShadow: isSelected ? `0 0 0 1px ${ACCENT}` : 'none',
    backgroundColor: isSelected ? ACCENT_SOFT : OB.canvas,
  }
}

/** Airbnb-style tile: icon over a title, the border thickens when chosen. */
export function OptionTile({ isSelected, onClick, title, description, icon, isMulti = false }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role={isMulti ? 'checkbox' : 'radio'}
      aria-checked={isSelected}
      className={`flex h-full min-h-[7.25rem] flex-col items-start justify-start gap-3 rounded-xl border p-4 text-left transition-[border-color,box-shadow,background-color,transform] duration-150 hover:border-[#17130F] active:scale-[0.98] ${FOCUS_RING}`}
      style={selectionStyle(isSelected)}
    >
      <span style={{ color: isSelected ? ACCENT : OB.ink }} aria-hidden>{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold" style={{ color: OB.ink }}>{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: OB.muted }}>{description}</span>}
      </span>
    </button>
  )
}

/** A full-width choice with a check on the right. */
export function OptionRow({ isSelected, onClick, title, description, icon, isMulti = false }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role={isMulti ? 'checkbox' : 'radio'}
      aria-checked={isSelected}
      className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-[#17130F] ${FOCUS_RING}`}
      style={selectionStyle(isSelected)}
    >
      {icon && <span className="shrink-0" style={{ color: OB.ink }} aria-hidden>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold" style={{ color: OB.ink }}>{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: OB.muted }}>{description}</span>}
      </span>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center border-[1.5px] transition-colors ${isMulti ? 'rounded-md' : 'rounded-full'}`}
        style={{ borderColor: isSelected ? ACCENT : OB.lineStrong, backgroundColor: isSelected ? ACCENT : 'transparent' }}
        aria-hidden
      >
        {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: ACCENT_INK }} />}
      </span>
    </button>
  )
}

/** Small round-cornered chip for quick picks (hours presets, closed days). */
export function Chip({ isSelected, onClick, children }: { isSelected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-[border-color,background-color,color] duration-150 hover:border-[#17130F] ${FOCUS_RING}`}
      style={{
        borderColor: isSelected ? ACCENT : OB.lineStrong,
        backgroundColor: isSelected ? ACCENT : OB.canvas,
        color: isSelected ? ACCENT_INK : OB.ink,
      }}
    >
      {children}
    </button>
  )
}

export function Switch({ isOn, label, onChange }: { isOn: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      onClick={() => onChange(!isOn)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${FOCUS_RING}`}
      style={{ backgroundColor: isOn ? ACCENT : OB.lineStrong }}
    >
      <span
        className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-[left] duration-200 ease-out"
        style={{ left: isOn ? 22 : 2 }}
        aria-hidden
      />
    </button>
  )
}

interface PhotoSlotProps {
  label: string
  imageUrl: string | null
  /** Resolves to an error message, or null on success. */
  onUpload: (file: File) => Promise<string | null>
  onRemove: () => Promise<string | null>
  isContain?: boolean
  aspect?: 'square' | 'wide'
  hint?: string
}

/** One tappable photo box: empty → pick a photo; filled → preview + remove. */
export function PhotoSlot({ label, imageUrl, onUpload, onRemove, isContain = false, aspect = 'square', hint }: PhotoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(task: () => Promise<string | null>) {
    setIsBusy(true)
    setError(null)
    setError(await task())
    setIsBusy(false)
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await run(async () => onUpload(await shrinkPhoto(file)))
  }

  return (
    <div>
      <div
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border transition-colors ${aspect === 'wide' ? 'aspect-[16/10]' : 'aspect-square'} ${imageUrl ? '' : 'border-dashed hover:border-[#17130F]'}`}
        style={{ borderColor: imageUrl ? OB.line : OB.lineStrong, backgroundColor: imageUrl ? OB.canvas : OB.wash }}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={label} className={`h-full w-full ${isContain ? 'object-contain p-5' : 'object-cover'}`} />
            <button
              type="button"
              onClick={() => run(onRemove)}
              disabled={isBusy}
              aria-label={`Remove ${label}`}
              className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#17130F] shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition hover:scale-105 ${FOCUS_RING}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className={`flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center ${FOCUS_RING}`}
          >
            <Camera className="h-6 w-6" strokeWidth={1.75} style={{ color: OB.ink }} aria-hidden />
            <span className="text-sm font-semibold" style={{ color: OB.ink }}>{label}</span>
            {hint && <span className="text-xs" style={{ color: OB.muted }}>{hint}</span>}
          </button>
        )}
        {isBusy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[2px]">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: OB.ink }} aria-label="Uploading" />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
      {error && <p role="alert" className="mt-1.5 text-[13px] font-medium text-red-700">{error}</p>}
    </div>
  )
}

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  isDisabled?: boolean
  type?: 'button' | 'submit'
  isFull?: boolean
}

const BUTTON_BASE = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-[filter,transform,background-color] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`
const PRIMARY_STYLE = { backgroundColor: ACCENT, color: ACCENT_INK }

export function PrimaryButton({ children, onClick, isDisabled = false, type = 'button', isFull = false }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={isDisabled} className={`${BUTTON_BASE} hover:brightness-110 ${isFull ? 'w-full' : ''}`} style={PRIMARY_STYLE}>
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, isDisabled = false, isFull = false }: ButtonProps) {
  return (
    <button type="button" onClick={onClick} disabled={isDisabled}
      className={`${BUTTON_BASE} border bg-white hover:bg-[#F6F4F1] ${isFull ? 'w-full' : ''}`}
      style={{ borderColor: OB.lineStrong, color: OB.ink }}>
      {children}
    </button>
  )
}

interface LinkButtonProps {
  href: string
  children: React.ReactNode
  isExternal?: boolean
  isFull?: boolean
}

function externalProps(isExternal: boolean) {
  return isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}

export function PrimaryLink({ href, children, isExternal = false, isFull = false }: LinkButtonProps) {
  return (
    <a href={href} className={`${BUTTON_BASE} hover:brightness-110 ${isFull ? 'w-full' : ''}`} style={PRIMARY_STYLE} {...externalProps(isExternal)}>
      {children}
    </a>
  )
}

export function SecondaryLink({ href, children, isExternal = false, isFull = false }: LinkButtonProps) {
  return (
    <a href={href} className={`${BUTTON_BASE} border bg-white hover:bg-[#F6F4F1] ${isFull ? 'w-full' : ''}`}
      style={{ borderColor: OB.lineStrong, color: OB.ink }} {...externalProps(isExternal)}>
      {children}
    </a>
  )
}

/** Airbnb's underlined text action (Back, Skip). */
export function TextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`min-h-12 rounded-lg px-2 text-[15px] font-semibold underline decoration-1 underline-offset-4 transition-colors hover:bg-[#F6F4F1] ${FOCUS_RING}`}
      style={{ color: OB.ink }}>
      {children}
    </button>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
      {children}
    </p>
  )
}

