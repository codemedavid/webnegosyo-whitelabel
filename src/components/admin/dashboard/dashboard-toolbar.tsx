import Link from 'next/link'
import { cn } from '@/lib/utils'
import { DASHBOARD_RANGES, rangeOption, type DashboardRange } from '@/lib/dashboard/periods'

interface DashboardToolbarProps {
  basePath: string
  range: DashboardRange
}

/** The period lives in the URL, so a view can be bookmarked or shared. */
export function DashboardToolbar({ basePath, range }: DashboardToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] font-semibold text-muted-foreground">
        Compared with <span className="text-foreground">{rangeOption(range).comparePhrase}</span>
      </p>
      <div
        role="group"
        aria-label="Choose a period"
        className="inline-flex w-full gap-0.5 rounded-full bg-white p-[3px] ring-1 ring-border sm:w-auto"
      >
        {DASHBOARD_RANGES.map((choice) => {
          const isActive = choice.value === range
          return (
            <Link
              key={choice.value}
              href={`${basePath}?range=${choice.value}`}
              aria-current={isActive ? 'true' : undefined}
              scroll={false}
              className={cn(
                'flex-1 whitespace-nowrap rounded-full px-3.5 py-2 text-center text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 sm:flex-none',
                isActive ? 'bg-wn-ink text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {choice.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
