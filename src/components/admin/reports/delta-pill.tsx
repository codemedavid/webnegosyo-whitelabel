import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MINUS, formatCount, formatRatio, formatSignedMoney } from '@/lib/reports/format'

export type DeltaPolarity = 'higher_is_better' | 'lower_is_better' | 'neutral'
export type DeltaKind = 'money' | 'count' | 'ratio'
type Direction = 'up' | 'down' | 'flat'
type Tone = 'good' | 'bad' | 'neutral'

/** A base at or below this shows "+3", not "+300%" (plan §4). */
const DEFAULT_SMALL_BASE: Record<Exclude<DeltaKind, 'ratio'>, number> = {
  count: 10,
  money: 100_000, // ₱1,000 in centavos
}
/** Below half a percent the change reads as "No change". */
const NO_CHANGE_RATIO = 0.005

export interface DeltaPillProps {
  current: number | null | undefined
  previous: number | null | undefined
  polarity: DeltaPolarity
  /** money = centavos; count = whole things; ratio = 0..1 (shown in points). */
  kind: DeltaKind
  /** Absolute difference instead of a percent at or below this base. */
  smallBase?: number
  /** Finishes the screen-reader sentence: "Up 12% on last week". */
  compareLabel?: string
  className?: string
}

export interface DeltaDescription {
  direction: Direction
  tone: Tone
  /** Visible text, signed: "+12%", "−₱450", "No change". */
  text: string
  /** Screen-reader sentence. */
  spoken: string
}

function signed(text: string, diff: number): string {
  if (diff > 0) return `+${text}`
  if (diff < 0) return `${MINUS}${text}`
  return text
}

function absoluteText(kind: DeltaKind, diff: number): string {
  if (kind === 'money') return formatSignedMoney(diff)
  if (kind === 'ratio') {
    const points = Math.round(Math.abs(diff) * 100)
    return signed(`${points} ${points === 1 ? 'pt' : 'pts'}`, diff)
  }
  return signed(formatCount(Math.abs(diff)), diff)
}

/** True when the absolute change rounds to nothing in its own unit. */
function isZeroChange(kind: DeltaKind, diff: number): boolean {
  if (kind === 'money') return Math.abs(diff) < 50 // under ₱0.50 rounds to ₱0
  if (kind === 'ratio') return Math.round(Math.abs(diff) * 100) === 0
  return Math.round(Math.abs(diff)) === 0
}

function toneFor(direction: Direction, polarity: DeltaPolarity): Tone {
  if (direction === 'flat' || polarity === 'neutral') return 'neutral'
  const isUpGood = polarity === 'higher_is_better'
  return (direction === 'up') === isUpGood ? 'good' : 'bad'
}

/**
 * Pure: what the pill says. `null` when there is nothing honest to compare
 * against (either side unknown). Ratios always show percentage points: a
 * percent of a percent ("food cost up 9%") misleads.
 */
export function describeDelta({
  current,
  previous,
  polarity,
  kind,
  smallBase,
  compareLabel = 'on the previous period',
}: Omit<DeltaPillProps, 'className'>): DeltaDescription | null {
  if (current === null || current === undefined || !Number.isFinite(current)) return null
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null

  const diff = current - previous
  const base = smallBase ?? (kind === 'ratio' ? Number.POSITIVE_INFINITY : DEFAULT_SMALL_BASE[kind])
  const isAbsolute = previous === 0 || Math.abs(previous) <= base
  const ratio = isAbsolute ? 0 : diff / Math.abs(previous)
  const isFlat = isAbsolute ? isZeroChange(kind, diff) : Math.abs(ratio) < NO_CHANGE_RATIO

  if (isFlat) {
    return { direction: 'flat', tone: 'neutral', text: 'No change', spoken: `No change ${compareLabel}` }
  }

  const direction: Direction = diff > 0 ? 'up' : 'down'
  const text = isAbsolute ? absoluteText(kind, diff) : signed(formatRatio(Math.abs(ratio)), diff)
  const unsigned = text.replace(/^[+−]/, '')
  return {
    direction,
    tone: toneFor(direction, polarity),
    text,
    spoken: `${direction === 'up' ? 'Up' : 'Down'} ${unsigned} ${compareLabel}`,
  }
}

const TONE_CLASSES: Record<Tone, string> = {
  good: 'bg-emerald-50 text-emerald-800',
  bad: 'bg-red-50 text-red-700',
  neutral: 'bg-muted text-muted-foreground',
}

const ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const

/**
 * "+12%" against the comparison period. Colour follows good/bad (polarity),
 * never direction alone, and the arrow + sign carry the meaning without it.
 */
export function DeltaPill({ className, ...props }: DeltaPillProps) {
  const delta = describeDelta(props)
  if (!delta) return null
  const Icon = ICONS[delta.direction]
  return (
    <span
      data-tone={delta.tone}
      data-direction={delta.direction}
      className={cn(
        'inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[12px] font-bold tabular-nums lining-nums',
        TONE_CLASSES[delta.tone],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span aria-hidden>{delta.text}</span>
      <span className="sr-only">{delta.spoken}</span>
    </span>
  )
}
