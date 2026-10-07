'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { shrinkPhoto } from './shrink-photo'

export const ONBOARDING_COLORS = SMARTMENU

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold" style={{ color: SMARTMENU.ink }}>{label}</span>
      {hint && <span className="mt-0.5 block text-xs" style={{ color: SMARTMENU.cocoa }}>{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

export const INPUT_CLASS =
  'w-full rounded-xl border border-black/15 bg-white px-3.5 py-3 text-[15px] outline-none transition focus:border-[#D7261D] focus:ring-2 focus:ring-[#D7261D]/20'

export function ChoiceChip({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className="flex min-h-12 items-center gap-2 rounded-xl border-2 px-3.5 py-2.5 text-left text-sm font-semibold transition"
      style={{
        borderColor: isSelected ? SMARTMENU.red : 'rgba(0,0,0,0.12)',
        backgroundColor: isSelected ? '#FFF1EE' : '#FFFFFF',
        color: SMARTMENU.ink,
      }}
    >
      {children}
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
}

/** One tappable photo box: empty → pick a photo; filled → preview + remove. */
export function PhotoSlot({ label, imageUrl, onUpload, onRemove, isContain = false }: PhotoSlotProps) {
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
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed"
        style={{ borderColor: imageUrl ? 'transparent' : 'rgba(0,0,0,0.18)', backgroundColor: SMARTMENU.cream }}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={label} className={`h-full w-full ${isContain ? 'object-contain p-3' : 'object-cover'}`} />
            <button
              type="button"
              onClick={() => run(onRemove)}
              disabled={isBusy}
              aria-label={`Remove ${label}`}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-xs font-semibold"
            style={{ color: SMARTMENU.cocoa }}
          >
            <ImagePlus className="h-6 w-6" aria-hidden />
            {label}
          </button>
        )}
        {isBusy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: SMARTMENU.red }} aria-label="Uploading" />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  isDisabled = false,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  isDisabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-bold transition disabled:opacity-60"
      style={{ backgroundColor: SMARTMENU.red, color: '#FFF7EE', boxShadow: `0 14px 30px -14px ${SMARTMENU.red}B3` }}
    >
      {children}
    </button>
  )
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-bold"
      style={{ backgroundColor: SMARTMENU.red, color: '#FFF7EE', boxShadow: `0 14px 30px -14px ${SMARTMENU.red}B3` }}
    >
      {children}
    </a>
  )
}
