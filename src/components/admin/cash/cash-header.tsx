import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cashHref, type CashPageContext, type CashTab } from '@/lib/cash/cash-page'
import { CashBranchSelect } from './cash-branch-select'
import { dayLabel } from './cash-format'

const STEP_CLASS =
  'grid size-11 place-items-center rounded-full bg-white text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink'

/** "Cash & remits" title, the business-day rule, branch picker and day stepper (UX §4.7). */
export function CashHeader({ context }: { context: CashPageContext }) {
  const link = (params: { day?: string | null; branch?: string | null; tab?: CashTab }) =>
    cashHref(context.tenantSlug, {
      tab: params.tab ?? context.tab,
      day: params.day === undefined ? context.day : params.day,
      branch: params.branch === undefined ? context.outletId : params.branch,
      today: context.today,
    })
  const branchHrefs = context.branchOptions
    ? Object.fromEntries([['', link({ branch: null })], ...context.branchOptions.map((option) => [option.value, link({ branch: option.value })])])
    : {}

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Reports</p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">Cash &amp; remits</h1>
        <p className="mt-1.5 text-[14px] leading-snug text-muted-foreground">
          Shifts, remittances and day closes · business day ends {context.cutoffLabel}
        </p>
      </div>
      {context.tab === 'shifts' && (
        <div className="flex flex-wrap items-center gap-2">
          {context.branchOptions ? (
            <CashBranchSelect value={context.outletId} options={context.branchOptions} hrefs={branchHrefs} />
          ) : (
            context.lockedBranchLabel && (
              <span className="inline-flex min-h-11 items-center rounded-full bg-wn-sand px-4 text-[14px] font-bold text-wn-ink ring-1 ring-wn-line">
                {context.lockedBranchLabel}
              </span>
            )
          )}
          <nav aria-label="Business day" className="flex items-center gap-1.5">
            <Link href={link({ day: context.previousDay })} className={STEP_CLASS} aria-label={`Previous day, ${dayLabel(context.previousDay)}`}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <span className="inline-flex min-h-11 min-w-[8.5rem] items-center justify-center rounded-full bg-white px-4 text-[14px] font-bold text-wn-ink ring-1 ring-border tabular-nums">
              {context.day === context.today ? `Today · ${dayLabel(context.day)}` : dayLabel(context.day)}
            </span>
            {context.nextDay ? (
              <Link href={link({ day: context.nextDay })} className={STEP_CLASS} aria-label={`Next day, ${dayLabel(context.nextDay)}`}>
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span className={cn(STEP_CLASS, 'cursor-not-allowed opacity-40 hover:ring-border')} aria-disabled="true" aria-label="No later day yet">
                <ChevronRight className="size-4" aria-hidden />
              </span>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

const TAB_LABELS: Readonly<Record<CashTab, string>> = { shifts: 'Shifts', settings: 'Settings' }

/** Wave 1: Shifts + Settings. To accept / Day closes / Cashiers arrive with remittances and the day close. */
export function CashTabs({ context }: { context: CashPageContext }) {
  return (
    <nav aria-label="Cash & remits sections" className="flex gap-1 border-b border-wn-line">
      {(['shifts', 'settings'] as const).map((tab) => {
        const isActive = tab === context.tab
        return (
          <Link
            key={tab}
            href={cashHref(context.tenantSlug, { tab, day: context.day, branch: context.outletId, today: context.today })}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-[14.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2',
              isActive ? 'border-wn-ink text-wn-ink' : 'border-transparent text-wn-stone hover:text-wn-ink',
            )}
          >
            {TAB_LABELS[tab]}
          </Link>
        )
      })}
    </nav>
  )
}
