import { Check, Repeat } from 'lucide-react'
import type { Chip, ChipTone } from '@/lib/texts/view/chips'
import { cn } from '@/lib/utils'

/** Text, dot and soft fill per tone. Amber text is 800 on 50 so it passes AA. */
export const TONE_CLASSES: Record<ChipTone, { chip: string; dot: string; text: string; border: string }> = {
  emerald: {
    chip: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    dot: 'bg-emerald-500', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-l-emerald-500',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    dot: 'bg-amber-500', text: 'text-amber-800 dark:text-amber-300', border: 'border-l-amber-500',
  },
  red: {
    chip: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive', text: 'text-destructive', border: 'border-l-destructive',
  },
  sky: {
    chip: 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    dot: 'bg-sky-500', text: 'text-sky-800 dark:text-sky-300', border: 'border-l-sky-500',
  },
  grey: {
    chip: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/60', text: 'text-muted-foreground', border: 'border-l-border',
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        chip.isOutline ? 'border bg-transparent text-muted-foreground' : tone.chip,
        className
      )}
    >
      {chip.icon === 'check' && <Check className="h-3 w-3" aria-hidden="true" />}
      {chip.icon === 'repeat' && <Repeat className="h-3 w-3" aria-hidden="true" />}
      {chip.icon === 'dot' && <StatusDot tone={chip.tone} isPulsing={chip.isPulsing} />}
      {chip.label}
    </span>
  )
}
