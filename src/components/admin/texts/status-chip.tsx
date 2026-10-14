import { Check, Repeat } from 'lucide-react'
import type { Chip, ChipTone } from '@/lib/texts/view/chips'
import { cn } from '@/lib/utils'

/**
 * The page's one status colour system: emerald = going out, amber = needs a
 * look, red = broken and guests are affected, sky = scheduled, slate = none
 * / off. Amber and emerald text are 800 on 50 so they pass AA.
 */
export const TONE_CLASSES: Record<ChipTone, { chip: string; dot: string; text: string; border: string; tile: string; wash: string; bar: string }> = {
  emerald: {
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/15',
    dot: 'bg-emerald-500', text: 'text-emerald-800', border: 'border-l-emerald-500',
    tile: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10',
    wash: 'from-emerald-50/80 via-white to-white', bar: 'bg-emerald-500',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20',
    dot: 'bg-amber-500', text: 'text-amber-800', border: 'border-l-amber-500',
    tile: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
    wash: 'from-amber-50/80 via-white to-white', bar: 'bg-amber-500',
  },
  red: {
    chip: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-600/15',
    dot: 'bg-red-600', text: 'text-red-700', border: 'border-l-red-600',
    tile: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15',
    wash: 'from-red-50/80 via-white to-white', bar: 'bg-red-600',
  },
  sky: {
    chip: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-600/15',
    dot: 'bg-sky-500', text: 'text-sky-800', border: 'border-l-sky-500',
    tile: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/10',
    wash: 'from-sky-50/80 via-white to-white', bar: 'bg-sky-500',
  },
  grey: {
    chip: 'bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-500/15',
    dot: 'bg-stone-400', text: 'text-stone-700', border: 'border-l-stone-300',
    tile: 'bg-wn-sand text-wn-stone ring-1 ring-inset ring-wn-line',
    wash: 'from-wn-sand via-white to-white', bar: 'bg-stone-400',
  },
}

export function StatusDot({ tone, isPulsing = false, className }: { tone: ChipTone; isPulsing?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden="true">
      {isPulsing && (
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping', TONE_CLASSES[tone].dot)} />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', TONE_CLASSES[tone].dot)} />
    </span>
  )
}

export function StatusChip({ chip, className }: { chip: Chip; className?: string }) {
  const tone = TONE_CLASSES[chip.tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none',
        chip.isOutline ? 'border border-dashed border-stone-300 bg-transparent text-stone-600' : tone.chip,
        className
      )}
    >
      {chip.icon === 'check' && <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />}
      {chip.icon === 'repeat' && <Repeat className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />}
      {chip.icon === 'dot' && <StatusDot tone={chip.tone} isPulsing={chip.isPulsing} />}
      {chip.label}
    </span>
  )
}

/** A soft tinted square for an icon: the page's one icon treatment. */
export function IconTile({ tone = 'grey', size = 'md', className, children }: { tone?: ChipTone; size?: 'sm' | 'md' | 'lg'; className?: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'sm' && 'h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4',
        size === 'md' && 'h-10 w-10 rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]',
        size === 'lg' && 'h-12 w-12 rounded-2xl [&_svg]:h-5 [&_svg]:w-5',
        TONE_CLASSES[tone].tile,
        className
      )}
    >
      {children}
    </span>
  )
}

/** Thin, rounded, animated (reduced-motion safe) progress bar. */
export function Meter({ ratio, tone = 'emerald', className, label }: { ratio: number; tone?: ChipTone; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-stone-200/70', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className={cn('h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none', TONE_CLASSES[tone].bar)} style={{ width: `${pct}%` }} />
    </div>
  )
}
