'use client'

import { cn } from '@/lib/utils'
import { BOOST_MOMENTS, type BoostMoment } from './boost-model'

export interface MomentStatus {
  /** e.g. "2 live", "On · automatic", "Not set up". */
  label: string
  isActive: boolean
}

interface BoostJourneyProps {
  status: Record<BoostMoment, MomentStatus>
}

/**
 * The customer's path through an order, left to right, with what is switched
 * on at each stop. Replaces the old tabs, which named offer types the diner
 * never sees; this names the moments they do. Each stop jumps to its section.
 */
export function BoostJourney({ status }: BoostJourneyProps) {
  const jumpTo = (moment: BoostMoment) => {
    document.getElementById(`boost-${moment}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav aria-label="Where customers see your offers" className="rounded-2xl border bg-card p-2">
      <ol className="grid grid-cols-2 gap-1 md:grid-cols-4">
        {BOOST_MOMENTS.map((moment, index) => {
          const Icon = moment.icon
          const current = status[moment.id]
          return (
            <li key={moment.id} className="relative">
              {index > 0 && (
                <span aria-hidden="true" className="absolute -left-1 top-1/2 hidden h-px w-2 bg-border md:block" />
              )}
              <button
                type="button"
                onClick={() => jumpTo(moment.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                    current.isActive ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card',
                      current.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                    )}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{moment.place}</span>
                  <span className={cn('block truncate text-xs', current.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                    {current.label}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
