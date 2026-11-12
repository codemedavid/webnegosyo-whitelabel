'use client'

import { useId, useState, type ReactNode } from 'react'
import { ImageUp, Loader2, X } from 'lucide-react'
import { uploadImageToImageKit } from '@/lib/imagekit-upload'
import { cn } from '@/lib/utils'

/** The console's form look (same as the merchant-app release editor). */
export const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50'
export const LABEL = 'mb-1 block text-xs font-medium text-white/60'
export const HINT = 'mt-1.5 text-xs text-white/40'
export const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40'
export const BUTTON_QUIET =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40'

export const STATUS_STYLE: Readonly<Record<string, string>> = {
  draft: 'bg-white/[0.08] text-white/70',
  live: 'bg-emerald-400/15 text-emerald-300',
  paused: 'bg-amber-400/15 text-amber-300',
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className={LABEL} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-300">{error}</p> : hint ? <p className={HINT}>{hint}</p> : null}
    </div>
  )
}

/** "12 / 30", amber once past `warnAt`, red past `max`. */
export function Counter({ value, max, warnAt }: { value: string; max: number; warnAt?: number }) {
  const length = value.length
  return (
    <span className={cn('text-xs tabular-nums', length > max ? 'text-red-300' : warnAt !== undefined && length > warnAt ? 'text-amber-300' : 'text-white/40')}>
      {length} / {max}
    </span>
  )
}

export interface ImageRules {
  /** Square, at least this many pixels a side. */
  minSquare?: number
  /** Refuse transparent pixels (Apple refuses a see-through app icon). */
  isOpaque?: boolean
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That file is not an image we can read.'))
    image.src = url
  })
}

function hasTransparency(image: HTMLImageElement): boolean {
  const canvas = document.createElement('canvas')
  // A sample is enough: a see-through corner or edge shows up at 256px.
  const size = Math.min(256, image.naturalWidth)
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return false
  context.drawImage(image, 0, 0, size, size)
  const { data } = context.getImageData(0, 0, size, size)
  for (let index = 3; index < data.length; index += 4) if (data[index] < 255) return true
  return false
}

/** What is wrong with this picture for its slot, or null. Runs in the browser before any upload. */
export async function imageProblem(file: File, rules: ImageRules): Promise<string | null> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) return 'Use a PNG or JPG.'
  const image = await loadImage(file)
  if (rules.minSquare) {
    if (image.naturalWidth !== image.naturalHeight) return `It must be square (this one is ${image.naturalWidth}×${image.naturalHeight}).`
    if (image.naturalWidth < rules.minSquare) return `At least ${rules.minSquare}×${rules.minSquare} pixels (this one is ${image.naturalWidth}).`
  }
  if (rules.isOpaque && file.type === 'image/png' && hasTransparency(image)) return 'No see-through areas: the App Store refuses a transparent icon.'
  return null
}

interface ImageFieldProps {
  label: string
  hint: ReactNode
  value: string | null
  onChange: (url: string | null) => void
  folder: string
  rules?: ImageRules
  disabled?: boolean
  /** How the preview is drawn: an app icon is rounded, a banner is wide. */
  shape?: 'icon' | 'wide' | 'tall'
  /** Off where the slot can't be empty (a banner needs its picture). */
  isRemovable?: boolean
}

export function ImageField({ label, hint, value, onChange, folder, rules = {}, disabled, shape = 'icon', isRemovable = true }: ImageFieldProps) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const problem = await imageProblem(file, rules)
      if (problem) return setError(problem)
      setProgress(0)
      const uploaded = await uploadImageToImageKit(file, { folder, onProgress: (percent: number) => setProgress(percent) })
      onChange(uploaded.url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The upload failed. Try again.')
    } finally {
      setProgress(null)
    }
  }

  const frame = shape === 'icon' ? 'h-20 w-20 rounded-[22%]' : shape === 'wide' ? 'h-20 w-36 rounded-xl' : 'h-28 w-16 rounded-xl'
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div className="flex items-center gap-4">
        <div className={cn('flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.04]', frame)}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- an uploaded store image
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageUp className="h-5 w-5 text-white/30" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor={inputId} className={cn(BUTTON_QUIET, 'cursor-pointer', disabled && 'pointer-events-none opacity-40')}>
            {progress !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            {progress !== null ? `Uploading ${Math.round(progress)}%` : value ? 'Replace' : 'Upload'}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={disabled || progress !== null}
            onChange={(event) => {
              void pick(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          {value && !disabled && isRemovable ? (
            <button type="button" className={BUTTON_QUIET} onClick={() => onChange(null)}>
              <X className="h-4 w-4" /> Remove
            </button>
          ) : null}
        </div>
      </div>
    </Field>
  )
}
