import Link from 'next/link'
import { ChevronLeft, ChevronRight, ClipboardCheck, Info, PackageCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { previousBusinessDayKey } from '@/lib/inventory/business-day'
import {
  describeReportCaveats,
  describeRevenueCaveat,
  formatBusinessDayLabel,
  formatFoodCostPercent,
  formatPeso,
  formatQuantity,
} from '@/lib/inventory/daily-report-view'
import { formatPercent } from '@/lib/inventory/daily-report-view'
import { resolveFoodCostPercent } from '@/lib/inventory/food-cost'
import { judgeVariance, type VarianceLevel } from '@/lib/inventory/variance-verdict'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'

interface DailyReportPanelProps {
  tenantSlug: string
  report: DailyInventoryReportForDay
  /**
   * The most recent day worth showing. Passed in rather than read from the
   * clock so the render stays deterministic — a `new Date()` in a server
   * component is a hydration mismatch waiting to happen.
   */
  latestDayKey: string
  /**
   * The day's takings. Three distinct states, and the distinction is the point:
   * a number is real money, `null` is "the order backend could not be read",
   * and ABSENT is "this caller does not deal in revenue at all" — which renders
   * the original stock-only report rather than an alarming failure notice.
   */
  revenue?: number | null
  /**
   * How many dishes have a working recipe. Absent means the caller cannot say,
   * and the verdict is omitted rather than guessed — a grade built on an
   * assumed coverage is exactly the false reassurance it exists to prevent.
   */
  dishesWithRecipe?: number
}

/** The day after `dayKey`, used only to decide whether a next day exists. */
function nextBusinessDayKey(dayKey: string): string {
  const next = Date.parse(`${dayKey}T00:00:00.000Z`) + 24 * 60 * 60 * 1000
  return new Date(next).toISOString().slice(0, 10)
}

function dayHref(tenantSlug: string, dayKey: string): string {
  // The tab travels with the day. Without it the merchant lands back on
  // Overview every time they step a day, which reads as the link being broken.
  return `/${tenantSlug}/admin/inventory?tab=reports&day=${dayKey}`
}

interface TotalProps {
  testId: string
  label: string
  amount: number
  hint: string
  tone?: 'neutral' | 'bad'
  /** Overrides the peso rendering — used for the percentage and for "not known". */
  display?: string
}

function Total({ testId, label, amount, hint, tone = 'neutral', display }: TotalProps) {
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'bad' && amount > 0 && 'text-red-600',
        )}
      >
        {display ?? formatPeso(amount)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/**
 * Literal class names — Tailwind scans for these as strings and an interpolated
 * `sm:grid-cols-${n}` compiles to nothing, silently stacking the cards.
 */
const TOTALS_GRID = {
  stock: 'grid grid-cols-2 gap-3 sm:grid-cols-3',
  withRevenue: 'grid grid-cols-2 gap-3 lg:grid-cols-5',
} as const

/** Shown instead of a percentage when the day has no answer. Not "0.0%". */
const UNKNOWN_FIGURE = '—'

/** Stepping a day is a thumb target on a phone, so it holds a 44px line. */
const DAY_LINK =
  'inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:h-11 max-sm:flex-1'

/**
 * A figure cell: a table cell above `md`, a labelled line inside a card below
 * it. The heading is generated rather than duplicated in markup, so the real
 * `<th>` stays the single accessible header for assistive technology.
 */
const FIGURE_CELL =
  'p-3 tabular-nums max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:p-0 max-md:pt-2 max-md:before:text-xs max-md:before:font-medium max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-muted-foreground'

/**
 * Literal class names — Tailwind reads the generated label out of the source
 * text, so an interpolated `content-['${label}']` compiles to nothing and the
 * card loses its headings.
 */
const LABEL = {
  opening: "max-md:before:content-['Opening']",
  received: "max-md:before:content-['In']",
  sold: "max-md:before:content-['Used']",
  waste: "max-md:before:content-['Waste']",
  shrinkage: "max-md:before:content-['Missing']",
  closing: "max-md:before:content-['Closing']",
  cogs: "max-md:before:content-['Cost']",
  recount: '',
} as const

/** Opens that ingredient's stock dialog with the movement already set to a count. */
function countHref(tenantSlug: string, inventoryItemId: string): string {
  return `/${tenantSlug}/admin/inventory?tab=ingredients&stock=${inventoryItemId}&reason=stocktake`
}

/**
 * A withheld verdict is styled like the caveats, not like a grade — it is the
 * report declining to answer, and it must not read as a fourth severity.
 */
const VERDICT_TONE: Record<VarianceLevel | 'unknown', string> = {
  good: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
  watch: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
  investigate: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
  unknown: 'border-dashed bg-muted/40',
}

/**
 * One Manila day of the stock ledger, reconciled and priced.
 *
 * Answers the question the merchant actually asked: what did today's trade cost
 * in ingredients, and does the shelf still agree with the till.
 *
 * Deliberately renders the rows in the order it receives them. The core already
 * ranked them worst-first by peso, and re-sorting here would bury an expensive
 * loss beneath a cheap one.
 */
export function DailyReportPanel({
  tenantSlug,
  report,
  latestDayKey,
  revenue,
  dishesWithRecipe,
}: DailyReportPanelProps) {
  // Same three-state rule as revenue: absent means "this caller cannot say",
  // and a verdict is never invented from an assumption.
  const verdict =
    dishesWithRecipe === undefined
      ? null
      : judgeVariance({
          cogs: report.totals.cogs,
          shrinkageCost: report.totals.shrinkageCost,
          countedCount: report.countedCount,
          dishesWithRecipe,
        })

  // `undefined` means this caller does not deal in revenue; `null` means it
  // tried and failed. Only the latter is worth telling the merchant about.
  const showsRevenue = revenue !== undefined
  const foodCostPercent = showsRevenue ? resolveFoodCostPercent(report.totals.cogs, revenue) : null
  const revenueCaveat = showsRevenue ? describeRevenueCaveat(revenue) : null

  const caveats = [
    ...(revenueCaveat ? [revenueCaveat] : []),
    ...describeReportCaveats(report, report.countSession),
  ]
  const nextDay = nextBusinessDayKey(report.dayKey)
  const hasNextDay = nextDay <= latestDayKey

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{formatBusinessDayLabel(report.dayKey)}</h2>
          <p className="text-sm text-muted-foreground">
            What the day&apos;s trade took off the shelf, and what it cost.
          </p>
        </div>

        <div className="flex items-center gap-2 max-sm:w-full">
          <Link
            href={dayHref(tenantSlug, previousBusinessDayKey(report.dayKey))}
            className={DAY_LINK}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous day
          </Link>
          {hasNextDay && (
            <Link href={dayHref(tenantSlug, nextDay)} className={DAY_LINK}>
              Next day
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {/*
        The verdict leads, because it is the answer and the figures are the
        working. When it declines to judge it says which thing to fix, so an
        unconfigured system reads as unconfigured rather than as excellent.
      */}
      {verdict && (
        <div
          className={cn('rounded-xl border p-4', VERDICT_TONE[verdict.level ?? 'unknown'])}
          data-testid="daily-report-verdict"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-semibold">{verdict.headline}</p>
            {verdict.percent !== null && (
              <p className="text-sm font-medium tabular-nums text-muted-foreground">
                {formatPercent(verdict.percent)} of what the day used is unaccounted for
              </p>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{verdict.detail}</p>
          {/*
            The verdict told the merchant to check the ingredients at the top of
            the list, and then pointed at nothing. An accusation with no way to
            act on it is a reason to stop opening this page.
          */}
          {report.totals.shrinkageCost > 0 && (
            <a
              href="#report-lines"
              className="mt-3 inline-flex items-center gap-1 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:h-11"
            >
              <ClipboardCheck className="h-4 w-4" />
              See what came up short
            </a>
          )}
        </div>
      )}

      <div className={showsRevenue ? TOTALS_GRID.withRevenue : TOTALS_GRID.stock}>
        {showsRevenue && (
          <>
            <Total
              testId="daily-report-total-revenue"
              label="Sales"
              amount={revenue ?? 0}
              display={revenue === null ? UNKNOWN_FIGURE : undefined}
              hint="What the day's orders took."
            />
            <Total
              testId="daily-report-food-cost"
              label="Food cost"
              amount={foodCostPercent ?? 0}
              // Never "0.0%" for an unknown day — a dash asks a question, a
              // zero answers one it has no business answering.
              display={
                foodCostPercent === null ? UNKNOWN_FIGURE : formatFoodCostPercent(foodCostPercent)
              }
              hint="Stock cost as a share of sales."
            />
          </>
        )}
        <Total
          testId="daily-report-total-cogs"
          label="Cost of goods sold"
          amount={report.totals.cogs}
          hint="Ingredients the day's orders consumed."
        />
        <Total
          testId="daily-report-total-waste"
          label="Waste"
          amount={report.totals.wasteCost}
          hint="Recorded spoilage and spillage."
          tone="bad"
        />
        <Total
          testId="daily-report-total-shrinkage"
          label="Shrinkage"
          amount={report.totals.shrinkageCost}
          hint="Stock a count found missing and unexplained."
          tone="bad"
        />
      </div>

      {/*
        The caveats sit ABOVE the numbers on purpose. A merchant reading a clean
        report has to learn why it is clean before they trust it — an uncounted
        day and a genuinely tidy day produce the same zero.
      */}
      {caveats.length > 0 && (
        <div
          data-testid="daily-report-caveats"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
              {caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {report.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <PackageCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium">No stock moved on this day</p>
          <p className="text-sm text-muted-foreground">
            Nothing was sold, delivered, wasted or counted against your ingredients.
          </p>
        </div>
      ) : (
        /*
          Eight columns do not survive a phone. Below `md` each line becomes its
          own card and every figure keeps its heading as a generated label, so
          the reconciliation is still readable rather than reduced to whichever
          columns happened to fit.
        */
        <div
          id="report-lines"
          className="scroll-mt-4 rounded-xl border md:overflow-x-auto max-md:border-0"
        >
          <table className="w-full text-sm max-md:block">
            <thead className="bg-muted/50 text-left max-md:hidden">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Ingredient
                </th>
                <th scope="col" className="p-3 font-medium">
                  Opening
                </th>
                <th scope="col" className="p-3 font-medium">
                  In
                </th>
                <th scope="col" className="p-3 font-medium">
                  Used
                </th>
                <th scope="col" className="p-3 font-medium">
                  Waste
                </th>
                <th scope="col" className="p-3 font-medium">
                  Missing
                </th>
                <th scope="col" className="p-3 font-medium">
                  Closing
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  Cost
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  <span className="sr-only">Recount</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block max-md:space-y-3">
              {report.rows.map((line) => (
                <tr
                  key={line.inventoryItemId}
                  data-testid={`daily-report-row-${line.inventoryItemId}`}
                  data-item-name={line.name}
                  className="md:border-t max-md:block max-md:rounded-xl max-md:border max-md:bg-card max-md:p-4"
                >
                  <td className="p-3 max-md:block max-md:border-b max-md:p-0 max-md:pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium max-md:text-base">{line.name}</span>
                      {line.wasCounted && (
                        <Badge variant="secondary" className="text-xs">
                          Counted
                        </Badge>
                      )}
                      {/*
                        Only when it happened. A transfer is neither usage nor a
                        loss, so it has no column of its own — but it does move
                        the closing balance, and an unexplained gap on a stock
                        report invites exactly the wrong conclusion. A permanent
                        column of zeros would cost every single-branch tenant a
                        column to describe something that never occurs.
                      */}
                      {line.transferred !== 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                          data-testid={`daily-report-transfer-${line.inventoryItemId}`}
                        >
                          {line.transferred < 0 ? 'Sent out' : 'Received in'}{' '}
                          {formatQuantity(
                            Math.abs(line.transferred),
                            line.stockUnitAbbreviation,
                          )}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className={cn(FIGURE_CELL, 'text-muted-foreground', LABEL.opening)}>
                    {formatQuantity(line.opening, line.stockUnitAbbreviation)}
                  </td>
                  <td className={cn(FIGURE_CELL, 'text-muted-foreground', LABEL.received)}>
                    {formatQuantity(line.received, line.stockUnitAbbreviation)}
                  </td>
                  <td className={cn(FIGURE_CELL, LABEL.sold)}>
                    {formatQuantity(line.sold, line.stockUnitAbbreviation)}
                  </td>
                  <td className={cn(FIGURE_CELL, LABEL.waste)}>
                    {formatQuantity(line.waste, line.stockUnitAbbreviation)}
                  </td>
                  <td
                    className={cn(
                      FIGURE_CELL,
                      LABEL.shrinkage,
                      line.shrinkage > 0 && 'font-medium text-red-600',
                    )}
                  >
                    {formatQuantity(line.shrinkage, line.stockUnitAbbreviation)}
                  </td>
                  <td className={cn(FIGURE_CELL, 'text-muted-foreground', LABEL.closing)}>
                    {formatQuantity(line.closing, line.stockUnitAbbreviation)}
                  </td>
                  {/*
                    The only row that gets an action is the one the report just
                    made an accusation about. Everything else here is a figure;
                    this is the way to answer it.
                  */}
                  <td className={cn(FIGURE_CELL, LABEL.recount, 'md:text-right')}>
                    {line.shrinkage > 0 ? (
                      <Link
                        href={countHref(tenantSlug, line.inventoryItemId)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-md:h-11 max-md:px-3 max-md:text-sm"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Count again
                      </Link>
                    ) : (
                      <span className="sr-only">Nothing missing</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      FIGURE_CELL,
                      LABEL.cogs,
                      'text-right max-md:font-medium',
                    )}
                  >
                    {formatPeso(line.cogs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
