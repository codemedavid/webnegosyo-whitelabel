'use client'

/**
 * What sits beside the dish form: a live preview of the dish as a customer
 * will read it, and a list of the form's sections to jump between. On a phone
 * the preview is left out and the sections become a row of chips under the
 * header.
 */

import { UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import type { OptionSummaryLine } from '@/lib/menu-editor/option-summary'
import type { JumpNavEntry } from '@/lib/menu-editor/section-nav'
import type { DishBasics } from '@/components/admin/menu-editor/dish-basics-section'

const MAX_PREVIEW_VALUES = 6

interface DishPreviewCardProps {
  basics: DishBasics
  categoryName?: string
  isAvailable: boolean
  isFeatured: boolean
  optionLines: readonly OptionSummaryLine[]
}

export function DishPreviewCard({ basics, categoryName, isAvailable, isFeatured, optionLines }: DishPreviewCardProps) {
  const price = parseFloat(basics.price)
  const salePrice = parseFloat(basics.discounted_price)
  const hasPrice = Number.isFinite(price)
  const isOnSale = hasPrice && Number.isFinite(salePrice) && salePrice < price

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer preview</span>
        {!isAvailable && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            Out of stock
          </span>
        )}
      </div>

      <div className={cn('relative flex aspect-[4/3] items-center justify-center bg-muted', !isAvailable && 'opacity-60')}>
        {basics.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={basics.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <UtensilsCrossed className="h-8 w-8 text-muted-foreground/60" aria-hidden />
        )}
        {isFeatured && (
          <span className="absolute left-3 top-3 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background">
            Featured
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-4">
        {categoryName && <p className="text-xs font-medium text-muted-foreground">{categoryName}</p>}
        <p className={cn('font-semibold leading-snug', !basics.name.trim() && 'text-muted-foreground')}>
          {basics.name.trim() || 'Dish name'}
        </p>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {basics.description.trim() || 'Your description shows here.'}
        </p>
        <p className="flex items-baseline gap-2 pt-1 tabular-nums">
          <span className="text-base font-bold">
            {isOnSale ? formatPrice(salePrice) : hasPrice ? formatPrice(price) : '₱—'}
          </span>
          {isOnSale && <span className="text-sm text-muted-foreground line-through">{formatPrice(price)}</span>}
        </p>
      </div>

      {optionLines.length > 0 && (
        <div className="space-y-3 border-t px-4 py-3">
          {optionLines.map((line) => (
            <div key={line.label}>
              <p className="mb-1.5 text-xs font-semibold">{line.label}</p>
              <div className="flex flex-wrap gap-1">
                {line.values.slice(0, MAX_PREVIEW_VALUES).map((value) => (
                  <span key={value} className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {value}
                  </span>
                ))}
                {line.values.length > MAX_PREVIEW_VALUES && (
                  <span className="px-1 py-0.5 text-xs text-muted-foreground">
                    +{line.values.length - MAX_PREVIEW_VALUES} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The section list beside the form on a wide screen. */
export function SectionNavList({ entries }: { entries: readonly JumpNavEntry[] }) {
  return (
    <nav aria-label="Dish sections" className="rounded-2xl border bg-card p-2 shadow-sm">
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <span>{entry.label}</span>
              {entry.status && <NavStatus entry={entry} />}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The same sections as a sticky, scrollable row of chips on a phone or tablet. */
export function SectionNavChips({ entries }: { entries: readonly JumpNavEntry[] }) {
  return (
    <nav
      aria-label="Dish sections"
      className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:top-0 md:-mx-6 md:px-6 lg:hidden"
    >
      <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="shrink-0">
            <a
              href={`#${entry.id}`}
              className="flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
            >
              {entry.label}
              {entry.status && <NavStatus entry={entry} />}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function NavStatus({ entry }: { entry: JumpNavEntry }) {
  return (
    <span
      className={cn(
        'text-xs font-normal',
        entry.isAttention ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
      )}
    >
      {entry.status}
    </span>
  )
}
