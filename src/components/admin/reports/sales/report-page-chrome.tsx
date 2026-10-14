import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { reportHref } from '@/lib/reports/report-links'
import { BREAKDOWN_META, breakdownsFor, type BreakdownSlug } from '@/lib/reports/report-view-model'
import { CoverageNote } from '../coverage-note'
import { ReportFilters } from '../report-filters'

export function reportsPath(context: Pick<ReportContext, 'tenantSlug'>, slug?: BreakdownSlug): string {
  return `/${context.tenantSlug}/admin/reports${slug ? `/${slug}` : ''}`
}

const DAY = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

function dayText(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`))
}

/** "This week · Mon, Oct 12 – Wed, Oct 14 · so far · compared with last week". */
function periodCaption(context: ReportContext): string {
  const { from, to, preset, label } = context.period
  const range = from === to ? dayText(from) : `${dayText(from)} – ${dayText(to)}`
  const parts = preset === 'custom' ? [range] : [label, range]
  if (context.period.isPartial) parts.push('so far')
  parts.push(context.compare ? `compared with ${context.compare.label}` : 'no comparison')
  return parts.join(' · ')
}

interface ReportHeaderProps {
  context: ReportContext
  title: string
  description: string
  /** The page's own path, so the filters stay on it. */
  path: string
  /** A breakdown links back to the overview. */
  backHref?: string
  pageParams?: Record<string, string | null>
}

export function ReportHeader({ context, title, description, path, backHref, pageParams }: ReportHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-[13px] font-bold text-muted-foreground outline-none transition-colors hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Sales
          </Link>
        ) : (
          <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Reports</p>
        )}
        <h1 className="mt-1 text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-snug text-muted-foreground text-pretty">{description}</p>
      </div>
      <div className="flex flex-col gap-2">
        <ReportFilters
          path={path}
          presets={context.presets}
          value={context.filter}
          branches={context.branchOptions}
          isBranchLocked={context.isBranchLocked}
          lockedBranchLabel={context.lockedBranchLabel}
          today={context.today}
          pageParams={pageParams}
        />
        <p className="text-[13px] font-medium text-muted-foreground tabular-nums">{periodCaption(context)}</p>
      </div>
    </header>
  )
}

/** Notes that change how far the figures can be trusted, above the figures (plan §4). */
export function ReportNotices({ context, children }: { context: ReportContext; children?: ReactNode }) {
  const hasAny = context.periodError || context.isMixedBackend || children
  if (!hasAny) return null
  return (
    <div className="flex flex-col gap-2">
      {context.periodError && (
        <CoverageNote tone="warning">
          {context.periodError} Showing {context.period.label.toLowerCase()} instead.
        </CoverageNote>
      )}
      {context.isMixedBackend && (
        <CoverageNote tone="info">
          These reports read orders saved in WebNegosyo’s main database. Orders your store took on its earlier real-time
          system are not included.
        </CoverageNote>
      )}
      {children}
    </div>
  )
}

/** The breakdown pages, as tabs that keep the filters. */
export function BreakdownTabs({ context, active }: { context: ReportContext; active: BreakdownSlug }) {
  const slugs = breakdownsFor({ isMultiBranch: context.isMultiBranch, isBranchLocked: context.isBranchLocked })
  return (
    <nav aria-label="Sales breakdowns" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1.5">
        {slugs.map((slug) => {
          const isActive = slug === active
          return (
            <li key={slug}>
              <Link
                href={reportHref(reportsPath(context, slug), context.filter)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-4 text-[13.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  isActive ? 'bg-wn-ink text-white' : 'bg-white text-wn-ink ring-1 ring-border hover:ring-wn-ink',
                )}
              >
                {BREAKDOWN_META[slug].title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Plan §2.3: what these figures are, and what they are not. */
export function ReportFooter() {
  return (
    <footer className="border-t border-border pt-4 text-[12.5px] leading-relaxed text-muted-foreground">
      <p>
        For your own records and bookkeeping. WebNegosyo is not a BIR-accredited POS. Issue your BIR-registered invoices
        separately.
      </p>
      <p className="mt-1">All times are Philippine time. Amounts include VAT where your prices do.</p>
    </footer>
  )
}

export function ReportPageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 scroll-pt-24">{children}</div>
}
