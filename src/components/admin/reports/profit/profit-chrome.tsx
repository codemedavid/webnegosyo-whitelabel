import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reportHref, type ReportLinkFilter } from '@/lib/reports/report-links'
import { PROFIT_LOCKED_MESSAGE, type ProfitView } from '@/lib/reports/profit-view'

export function profitPath(tenantSlug: string): string {
  return `/${tenantSlug}/admin/reports/profit`
}

const TABS: ReadonlyArray<{ view: ProfitView; label: string }> = [
  { view: 'profit', label: 'Profit' },
  { view: 'cash', label: 'Cash flow' },
]

/** Profit ⇄ Cash flow, keeping the period and branch. */
export function ProfitTabs({ tenantSlug, filter, active }: { tenantSlug: string; filter: ReportLinkFilter; active: ProfitView }) {
  return (
    <nav aria-label="Profit views">
      <ul className="flex gap-1.5">
        {TABS.map((tab) => {
          const isActive = tab.view === active
          return (
            <li key={tab.view}>
              <Link
                href={reportHref(profitPath(tenantSlug), filter, { view: tab.view === 'cash' ? 'cash' : null })}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-4 text-[13.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  isActive ? 'bg-wn-ink text-white' : 'bg-white text-wn-ink ring-1 ring-border hover:ring-wn-ink',
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Without Expenses + Costs the figures are not shown at all. */
export function ProfitLocked() {
  return (
    <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-border">
      <Lock className="mx-auto size-5 text-wn-stone" aria-hidden />
      <p className="mt-2 text-[17px] font-extrabold text-wn-ink">Profit is for the owner’s eyes.</p>
      <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-muted-foreground text-pretty">{PROFIT_LOCKED_MESSAGE}</p>
    </div>
  )
}

/** The Reports overview's door to Profit (shown only to accounts that may open it). */
export function ProfitEntryCard({ tenantSlug, filter }: { tenantSlug: string; filter: ReportLinkFilter }) {
  return (
    <Link
      href={reportHref(profitPath(tenantSlug), filter)}
      className="group flex min-h-16 items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-border outline-none transition-colors hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-wn-ink">Profit</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">
          Sales − Ingredients − Expenses, for the same period. What you actually kept.
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
    </Link>
  )
}
