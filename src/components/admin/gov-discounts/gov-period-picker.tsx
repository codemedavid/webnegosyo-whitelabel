import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  REPORT_PERIOD_LABELS,
  type ReportPeriod,
  type ReportPeriodKey,
} from '@/lib/gov-discount-reports/period'

const PRESETS: readonly Exclude<ReportPeriodKey, 'custom'>[] = ['today', 'week', 'month', 'last_month']

export interface GovPeriodPickerProps {
  basePath: string
  period: ReportPeriod
}

/**
 * The days every figure on the page covers.
 *
 * Links and a plain GET form, not client state: the period lives in the URL,
 * so "last month's Senior book" can be bookmarked or sent to the accountant
 * and opens on the same days. Works before any JavaScript has loaded.
 */
export function GovPeriodPicker({ basePath, period }: GovPeriodPickerProps) {
  return (
    <div className="flex flex-col gap-3 lg:items-end">
      <nav className="flex flex-wrap gap-1 rounded-full border bg-muted/40 p-1" aria-label="Report period">
        {PRESETS.map((key) => {
          const isActive = key === period.key
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
              {REPORT_PERIOD_LABELS[key]}
            </Link>
          )
        })}
      </nav>

      <form
        action={basePath}
        method="get"
        className="flex flex-wrap items-end gap-2"
        aria-label="Custom date range"
      >
        <input type="hidden" name="period" value="custom" />
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <Input type="date" name="from" defaultValue={period.fromDay} required className="h-8 w-[9.5rem]" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          To
          <Input type="date" name="to" defaultValue={period.toDay} required className="h-8 w-[9.5rem]" />
        </label>
        <Button
          type="submit"
          size="sm"
          variant={period.key === 'custom' ? 'default' : 'outline'}
          className="h-8"
        >
          Show
        </Button>
      </form>
    </div>
  )
}
