import { BadgePercent, IdCard, Receipt, Scale, Wallet } from 'lucide-react'
import { StaffStat, StaffStatStrip } from '@/components/admin/staff/staff-stat'
import { formatPesoCentavos, formatSalesCount } from '@/lib/gov-discount-reports/format'
import type { GroupTotals, MoneyTotals } from '@/lib/gov-discount-reports/types'

export interface GovOverviewProps {
  totals: MoneyTotals
  reversedCount: number
  periodLabel: string
}

/**
 * Five figures, net of reversals, in the order an accountant reads a sales
 * book line: how many, on how much, VAT out, 20% off, total given away.
 */
export function GovOverview({ totals, reversedCount, periodLabel }: GovOverviewProps) {
  const reversedHint = reversedCount === 0 ? periodLabel : `${reversedCount} taken back · already subtracted`

  return (
    <StaffStatStrip>
      <StaffStat
        testId="gov-stat-sales"
        label="Senior/PWD sales"
        value={String(totals.sales)}
        icon={<IdCard className="h-4 w-4" />}
        hint={reversedHint}
      />
      <StaffStat
        testId="gov-stat-gross"
        label="Gross sales covered"
        value={formatPesoCentavos(totals.grossShare)}
        icon={<Receipt className="h-4 w-4" />}
        hint="Their share, VAT included"
      />
      <StaffStat
        testId="gov-stat-vat"
        label="VAT exempted"
        value={formatPesoCentavos(totals.vatRemoved)}
        icon={<Scale className="h-4 w-4" />}
        hint="12% not charged"
      />
      <StaffStat
        testId="gov-stat-discount"
        label="20% discounts"
        value={formatPesoCentavos(totals.discount)}
        icon={<BadgePercent className="h-4 w-4" />}
        hint="The discount itself"
      />
      <StaffStat
        testId="gov-stat-reduction"
        label="Total taken off"
        value={formatPesoCentavos(totals.reduction)}
        icon={<Wallet className="h-4 w-4" />}
        hint="VAT + discount, off the bills"
      />
    </StaffStatStrip>
  )
}

interface BreakdownProps {
  title: string
  description: string
  groups: readonly GroupTotals[]
  testId: string
}

function share(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0
  return Math.min(100, Math.round((part / whole) * 100))
}

/** One way of slicing the period: by kind, by cashier, by branch. */
export function GovBreakdown({ title, description, groups, testId }: BreakdownProps) {
  const largest = groups.reduce((max, group) => Math.max(max, group.totals.reduction), 0)

  return (
    <section data-testid={testId} aria-labelledby={`${testId}-title`} className="rounded-xl border bg-card p-5">
      <h3 id={`${testId}-title`} className="font-semibold">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground">{description}</p>

      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nothing in this period.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {groups.map((group) => (
            <li key={group.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{group.label}</span>
                <span className="shrink-0 tabular-nums">{formatPesoCentavos(group.totals.reduction)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${share(group.totals.reduction, largest)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatSalesCount(group.totals.sales)} · {formatPesoCentavos(group.totals.discount)} discount ·{' '}
                {formatPesoCentavos(group.totals.vatRemoved)} VAT
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
