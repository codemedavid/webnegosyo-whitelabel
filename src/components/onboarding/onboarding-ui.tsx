'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { shrinkPhoto } from './shrink-photo'

/**
 * Building blocks of the set-up pages. Controls read the merchant's brand
 * through `--ob-accent` / `--ob-accent-ink` / `--ob-accent-soft` (see
 * `onboarding-theme.ts`), so the whole wizard re-colors the moment a logo or
 * color is picked.
 */

export const ONBOARDING_COLORS = SMARTMENU

export const ACCENT = 'var(--ob-accent, #D7261D)'
export const ACCENT_INK = 'var(--ob-accent-ink, #FFF7EE)'
export const ACCENT_SOFT = 'var(--ob-accent-soft, #FFF1EE)'

export const DISPLAY_FONT = 'var(--font-landing-display), system-ui, sans-serif'
export const SERIF_FONT = 'var(--font-landing-serif), Georgia, serif'

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold" style={{ color: SMARTMENU.ink }}>{label}</span>
      {hint && <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: SMARTMENU.cocoa }}>{hint}</span>}
      <span className="mt-2 block">{children}</span>
    </label>
  )
}

export const INPUT_CLASS =
  'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-[15px] text-[#1C1613] shadow-[0_1px_0_rgba(0,0,0,0.03)] outline-none transition placeholder:text-black/35 focus:border-[var(--ob-accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--ob-accent)_18%,transparent)]'

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold" style={{ color: SMARTMENU.ink }}>{children}</p>
}

interface ChoiceChipProps {
  isSelected: boolean
  onClick: () => void
  children: React.ReactNode
}

export function ChoiceChip({ isSelected, onClick, children }: ChoiceChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className="flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98]"
      style={{
        borderColor: isSelected ? ACCENT : 'rgba(0,0,0,0.08)',
        backgroundColor: isSelected ? ACCENT_SOFT : '#FFFFFF',
        color: SMARTMENU.ink,
      }}
    >
      {children}
    </button>
  )
}

interface ChoiceTileProps extends ChoiceChipProps {
  title: string
  description?: string
  icon: React.ReactNode
}

/** A larger choice with an icon and one line of explanation. */
export function ChoiceTile({ isSelected, onClick, title, description, icon }: Omit<ChoiceTileProps, 'children'>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className="relative flex h-full flex-col items-start gap-2 rounded-3xl border-2 bg-white p-4 text-left transition active:scale-[0.98]"
      style={{ borderColor: isSelected ? ACCENT : 'rgba(0,0,0,0.07)', backgroundColor: isSelected ? ACCENT_SOFT : '#FFFFFF' }}
    >
      <span className="text-2xl leading-none" aria-hidden>{icon}</span>
      <span className="text-[15px] font-bold" style={{ color: SMARTMENU.ink }}>{title}</span>
      {description && <span className="text-xs leading-relaxed" style={{ color: SMARTMENU.cocoa }}>{description}</span>}
      <span
        className="absolute right-3 top-3 h-5 w-5 rounded-full border-2 transition"
        style={{ borderColor: isSelected ? ACCENT : 'rgba(0,0,0,0.15)', backgroundColor: isSelected ? ACCENT : 'transparent', boxShadow: isSelected ? 'inset 0 0 0 3px #fff' : 'none' }}
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
  /** Taller slot used for the logo. */
  isLarge?: boolean
}

/** One tappable photo box: empty → pick a photo; filled → preview + remove. */
export function PhotoSlot({ label, imageUrl, onUpload, onRemove, isContain = false, isLarge = false }: PhotoSlotProps) {
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
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed transition ${isLarge ? 'aspect-[4/3]' : 'aspect-square'}`}
        style={{ borderColor: imageUrl ? 'transparent' : 'rgba(0,0,0,0.14)', backgroundColor: imageUrl ? '#FFFFFF' : SMARTMENU.creamDeep }}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={label} className={`h-full w-full ${isContain ? 'object-contain p-4' : 'object-cover'}`} />
            <button
              type="button"
              onClick={() => run(onRemove)}
              disabled={isBusy}
              aria-label={`Remove ${label}`}
              className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/75"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center text-xs font-semibold transition hover:bg-black/[0.02]"
            style={{ color: SMARTMENU.cocoa }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
              <Camera className="h-5 w-5" style={{ color: ACCENT }} aria-hidden />
            </span>
            {label}
          </button>
        )}
        {isBusy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/75 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: ACCENT }} aria-label="Uploading" />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
      {error && <p className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
    </div>
  )
}

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  isDisabled?: boolean
  type?: 'button' | 'submit'
}

const PRIMARY_CLASS =
  'inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60'
const PRIMARY_STYLE = {
  backgroundColor: ACCENT,
  color: ACCENT_INK,
  boxShadow: '0 16px 32px -16px color-mix(in srgb, var(--ob-accent, #D7261D) 70%, transparent)',
}

export function PrimaryButton({ children, onClick, isDisabled = false, type = 'button' }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={isDisabled} className={PRIMARY_CLASS} style={PRIMARY_STYLE}>
      {children}
    </button>
  )
}

export function PrimaryLink({ href, children, isExternal = false }: { href: string; children: React.ReactNode; isExternal?: boolean }) {
  return (
    <a href={href} className={PRIMARY_CLASS} style={PRIMARY_STYLE} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  )
}

export function SecondaryLink({ href, children, isExternal = false }: { href: string; children: React.ReactNode; isExternal?: boolean }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 text-sm font-bold transition hover:bg-black/[0.02]"
      style={{ color: SMARTMENU.ink }}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>{children}</div>
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
      {children}
    </p>
  )
}
