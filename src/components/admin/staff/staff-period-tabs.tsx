import Link from 'next/link'
import {
  ACTIVITY_PERIODS,
  ACTIVITY_PERIOD_LABELS,
  type ActivityPeriodKey,
} from '@/lib/staff-activity/activity-period'

/**
 * The window every staff figure on the page is counted over.
 *
 * Links, not buttons: the period is in the URL, so a shift report can be sent
 * to someone and open on the same days it was read on.
 */
export function StaffPeriodTabs({
  basePath,
  period,
}: {
  basePath: string
  period: ActivityPeriodKey
}) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-full border bg-muted/40 p-1" aria-label="Report period">
      {ACTIVITY_PERIODS.map((key) => {
        const isActive = key === period
        return (
          <Link
            key={key}
            href={`${basePath}?period=${key}`}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              isActive
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {ACTIVITY_PERIOD_LABELS[key]}
          </Link>
        )
      })}
    </nav>
  )
}
