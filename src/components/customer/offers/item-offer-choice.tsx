'use client'

import { Check, ChevronRight } from 'lucide-react'
import type { OfferTheme } from './offer-theme'

export interface ItemOfferOption {
  id: string
  label: string
  /** "₱99" for the current item, "+₱50" for an upgrade. */
  priceLabel: string
  imageUrl?: string | null
  /** e.g. "Combo" — shown small under the label. */
  note?: string
}

export interface ItemOfferChoiceProps {
  header: string
  current: ItemOfferOption
  options: readonly ItemOfferOption[]
  theme: OfferTheme
  onChoose: (optionId: string) => void
}

/**
 * "Make it a meal?" as part of the item page — a choice the diner makes while
 * choosing, where the old flow threw a full-screen takeover over the product
 * 200 ms after it opened, before the diner had even seen what they tapped.
 *
 * The current item is shown selected; every other option is one tap away and
 * clearly priced as the difference.
 */
export function ItemOfferChoice({ header, current, options, theme, onChoose }: ItemOfferChoiceProps) {
  if (options.length === 0) return null
  return (
    <section aria-label={header} className="py-2">
      <h3 className="mb-3 text-base font-semibold" style={{ color: theme.text }}>
        {header}
      </h3>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <OptionCard option={current} theme={theme} isCurrent />
        {options.map((option) => (
          <OptionCard key={option.id} option={option} theme={theme} onChoose={() => onChoose(option.id)} />
        ))}
      </div>
    </section>
  )
}

interface OptionCardProps {
  option: ItemOfferOption
  theme: OfferTheme
  isCurrent?: boolean
  onChoose?: () => void
}

function OptionCard({ option, theme, isCurrent = false, onChoose }: OptionCardProps) {
  const content = (
    <>
      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl" style={{ backgroundColor: theme.border }}>
        {option.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
        {isCurrent && (
          <span
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full shadow-sm"
            style={{ backgroundColor: theme.accent, color: theme.accentText }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="mt-2 block px-0.5 text-left">
        <span className="line-clamp-2 text-sm font-semibold leading-snug" style={{ color: theme.text }}>
          {option.label}
        </span>
        {option.note && (
          <span className="block text-xs" style={{ color: theme.muted }}>{option.note}</span>
        )}
        <span className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-bold" style={{ color: isCurrent ? theme.text : theme.accent }}>
            {option.priceLabel}
          </span>
          {!isCurrent && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: theme.muted }} aria-hidden="true" />}
        </span>
      </span>
    </>
  )

  const shared = 'w-[46%] max-w-[190px] shrink-0 snap-start rounded-2xl border-2 p-2 transition-transform'
  if (isCurrent) {
    return (
      <div className={shared} style={{ borderColor: theme.accent, backgroundColor: theme.card }} aria-current="true">
        {content}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onChoose}
      className={`${shared} text-left active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
      style={{ borderColor: theme.border, backgroundColor: theme.card }}
    >
      {content}
    </button>
  )
}
