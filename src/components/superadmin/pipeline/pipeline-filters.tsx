/**
 * Offer + window pills for the sales pipeline. Server-rendered links, so the
 * filters live in the URL (shareable, back-button safe) with no client bundle.
 */

import Link from 'next/link'
import {
  PIPELINE_OFFERS,
  PIPELINE_RANGES,
  type PipelineFilters,
  type PipelineOffer,
  type PipelineRange,
} from '@/lib/sales-pipeline/filters'

const BASE_PATH = '/superadmin/pipeline'

function hrefFor(filters: PipelineFilters): string {
  return `${BASE_PATH}?offer=${filters.offer}&range=${filters.range}`
}

interface PillGroupProps<T extends string> {
  label: string
  options: ReadonlyArray<readonly [T, string]>
  selected: T
  toHref: (value: T) => string
}

function PillGroup<T extends string>({ label, options, selected, toHref }: PillGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-1"
    >
      {options.map(([value, text]) => {
        const isActive = value === selected
        return (
          <Link
            key={value}
            href={toHref(value)}
            scroll={false}
            aria-current={isActive ? 'true' : undefined}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-white text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            {text}
          </Link>
        )
      })}
    </div>
  )
}

export function PipelineFiltersBar({ filters }: { filters: PipelineFilters }) {
  const offers = Object.entries(PIPELINE_OFFERS) as [PipelineOffer, string][]
  const ranges = (Object.entries(PIPELINE_RANGES) as [PipelineRange, { label: string }][]).map(
    ([value, { label }]) => [value, label] as const,
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <PillGroup
        label="Offer"
        options={offers}
        selected={filters.offer}
        toHref={(offer) => hrefFor({ ...filters, offer })}
      />
      <PillGroup
        label="Ordered within"
        options={ranges}
        selected={filters.range}
        toHref={(range) => hrefFor({ ...filters, range })}
      />
    </div>
  )
}
