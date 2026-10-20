import { CalendarHeart, ChevronRight, HeartHandshake, RotateCcw, TrendingDown, UserPlus, type LucideIcon } from 'lucide-react'
import type { CampaignPreset } from '@/lib/texts/view/presets'
import { cn } from '@/lib/utils'

const LOOK: Record<string, { icon: LucideIcon; tile: string }> = {
  weekend_promo: { icon: CalendarHeart, tile: 'bg-wn-coral-wash text-wn-coral-deep' },
  thank_regulars: { icon: HeartHandshake, tile: 'bg-rose-50 text-rose-700' },
  win_back: { icon: RotateCcw, tile: 'bg-sky-50 text-sky-700' },
  slipping_regulars: { icon: TrendingDown, tile: 'bg-amber-50 text-amber-700' },
  second_visit: { icon: UserPlus, tile: 'bg-emerald-50 text-emerald-700' },
}
/** The goal most stores start with. */
export const POPULAR_PRESET = 'weekend_promo'

/** One goal: icon in a soft tile, what it does, a gentle lift on hover. */
export function PresetCard({ preset, onPick, layout = 'tile' }: { preset: CampaignPreset; onPick: () => void; layout?: 'tile' | 'row' }) {
  const look = LOOK[preset.id] ?? LOOK.weekend_promo
  const Icon = look.icon
  const isPopular = preset.id === POPULAR_PRESET
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'group relative flex w-full gap-4 rounded-2xl border border-wn-line bg-white text-left shadow-[0_1px_2px_rgba(29,24,21,0.04)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_8px_24px_-12px_rgba(29,24,21,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        layout === 'tile' ? 'items-center p-4 sm:flex-col sm:items-start sm:p-5' : 'items-center p-4'
      )}
    >
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', look.tile)} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {preset.title}
          {isPopular && <span className="rounded-full bg-wn-coral px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Popular</span>}
        </span>
        <span className="mt-0.5 block text-sm text-wn-stone">{preset.tagline}</span>
      </span>
      {layout === 'row' && <ChevronRight className="h-4 w-4 shrink-0 text-wn-stone transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />}
    </button>
  )
}
