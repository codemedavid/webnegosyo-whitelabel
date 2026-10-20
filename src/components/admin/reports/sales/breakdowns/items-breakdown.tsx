import Link from 'next/link'
import { Suspense } from 'react'
import { cn } from '@/lib/utils'
import { getBoostMenu } from '@/lib/boost/workspace'
import { BCG_MERCHANT_LABELS } from '@/lib/bcg-labels'
import type { MenuClassification } from '@/lib/menu-engineering-classify'
import { menuMatrix, windowDays } from '@/lib/reports/breakdown-view'
import { formatCount, formatMoney } from '@/lib/reports/format'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { reportClient } from '@/lib/reports/read/load-report-context'
import { REPORT_FAILED_MESSAGE, readItems, readTotals } from '@/lib/reports/read/report-rpc'
import type { SalesTotals } from '@/lib/reports/read/report-rpc-rows'
import { reportHref } from '@/lib/reports/report-links'
import { withPrevious } from '@/lib/reports/report-view-model'
import type { ItemRow } from '@/lib/reports/sales-breakdowns'
import { PickedTogetherSection, PickedTogetherSkeleton } from '@/components/admin/boost/picked-together-section'
import { CoverageNote } from '../../coverage-note'
import { ReportSection } from '../../report-section'
import { BreakdownTable, type BreakdownTableRow } from '../breakdown-table'
import { reportsPath } from '../report-page-chrome'

export type ItemsView = 'table' | 'matrix'

export function parseItemsView(raw: string | string[] | undefined): ItemsView {
  return (Array.isArray(raw) ? raw[0] : raw) === 'matrix' ? 'matrix' : 'table'
}

function itemDetail(row: ItemRow): string | undefined {
  if (row.isUnrecorded) return 'Orders saved without their dishes'
  const parts = [row.categoryLabel, row.menuItemId === null ? 'Not on the menu now' : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** What the line figures leave out, said above them (plan §4). */
export function LineCoverageNotes({ totals }: { totals: SalesTotals | null }) {
  if (!totals) return null
  const { ordersWithoutLines, ordersLinesMismatch } = totals.coverage
  if (ordersWithoutLines === 0 && ordersLinesMismatch === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {ordersWithoutLines > 0 && (
        <CoverageNote tone="warning">
          {formatCount(ordersWithoutLines)} {ordersWithoutLines === 1 ? 'order was' : 'orders were'} saved without their
          dishes. Their sales are listed as “Items not recorded”, so the rows still add up to net sales.
        </CoverageNote>
      )}
      {ordersLinesMismatch > 0 && (
        <CoverageNote tone="info">
          {formatCount(ordersLinesMismatch)} edited {ordersLinesMismatch === 1 ? 'order' : 'orders'} had dish prices that no
          longer matched the bill. Their dishes were scaled to the bill, so items add up to net sales exactly.
        </CoverageNote>
      )}
    </div>
  )
}

function ViewSwitch({ context, view }: { context: ReportContext; view: ItemsView }) {
  const path = reportsPath(context, 'items')
  const options: Array<{ value: ItemsView; label: string }> = [
    { value: 'table', label: 'Ranked list' },
    { value: 'matrix', label: 'Menu matrix' },
  ]
  return (
    <div role="group" aria-label="Items view" className="inline-flex rounded-full bg-wn-sand p-1 ring-1 ring-wn-line">
      {options.map((option) => (
        <Link
          key={option.value}
          href={reportHref(path, context.filter, { view: option.value === 'matrix' ? 'matrix' : null })}
          aria-current={option.value === view ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            option.value === view ? 'bg-white text-wn-ink shadow-sm ring-1 ring-wn-line' : 'text-muted-foreground hover:text-wn-ink',
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  )
}

const QUADRANTS = ['star', 'plowhorse', 'puzzle', 'dog'] as const

async function readMatrix(context: ReportContext, items: ItemRow[]): Promise<MenuClassification | null> {
  try {
    const menu = await getBoostMenu({ id: context.tenantId })
    return menuMatrix(
      items,
      menu.items.map((item) => ({ id: item.id, name: item.name, price: item.price, categoryId: item.categoryId })),
      windowDays(context.period.start, context.period.end),
    )
  } catch (error) {
    // Scoped to this card (plan §4): the rest of the page still renders.
    console.error('[reports] menu matrix failed', error instanceof Error ? error.message : String(error))
    return null
  }
}

async function MenuMatrix({ context, items }: { context: ReportContext; items: ItemRow[] }) {
  const matrix = await readMatrix(context, items)
  if (!matrix) {
    return (
      <div data-testid="report-section-error" className="rounded-xl bg-red-50 px-3.5 py-3 text-[13.5px] leading-snug text-red-800">
        {REPORT_FAILED_MESSAGE}
      </div>
    )
  }
  const netById = new Map(items.flatMap((row) => (row.menuItemId ? [[row.menuItemId, row.netCents] as const] : [])))

  if (!matrix.canApply) {
    return (
      <CoverageNote tone="info">
        Not enough sales in this period to sort the menu fairly. Pick a longer period, like this month.
      </CoverageNote>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <CoverageNote tone="info">
        Popular = sold at least 70% of an even share. “Earns more” is judged by menu price until dish costs feed this view, so
        a pricey dish with a costly recipe can look better than it is.
      </CoverageNote>
      <div className="grid gap-3 sm:grid-cols-2">
        {QUADRANTS.map((quadrant) => {
          const meta = BCG_MERCHANT_LABELS[quadrant]
          const members = matrix.items
            .filter((entry) => entry.classification === quadrant)
            .toSorted((a, b) => b.units - a.units || a.name.localeCompare(b.name))
          return (
            <section key={quadrant} aria-label={meta.label} className="rounded-xl bg-wn-sand p-4 ring-1 ring-wn-line">
              <h3 className="text-[14.5px] font-extrabold text-wn-ink">
                {meta.label} <span className="font-semibold text-muted-foreground">· {formatCount(members.length)}</span>
              </h3>
              <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{meta.description}</p>
              {members.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">None this period.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {members.slice(0, 8).map((entry) => (
                    <li key={entry.itemId} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className="min-w-0 truncate font-semibold text-wn-ink">{entry.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatCount(entry.units)} sold · {formatMoney(netById.get(entry.itemId) ?? 0)}
                      </span>
                    </li>
                  ))}
                  {members.length > 8 && (
                    <li className="text-[12.5px] font-semibold text-muted-foreground">and {formatCount(members.length - 8)} more</li>
                  )}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export async function ItemsBreakdown({ context, view }: { context: ReportContext; view: ItemsView }) {
  const client = await reportClient()
  const { current, previous } = context.windows
  const [items, previousItems, totals] = await Promise.all([
    readItems(client, current),
    previous ? readItems(client, previous) : Promise.resolve(null),
    readTotals(client, current),
  ])

  const rows: BreakdownTableRow[] = items.ok
    ? withPrevious(items.data, previousItems?.ok ? previousItems.data : null).map((row) => ({
        key: row.key,
        label: row.label,
        detail: itemDetail(row),
        count: row.quantity,
        netCents: row.netCents,
        previousNetCents: row.previous === undefined ? undefined : (row.previous?.netCents ?? null),
      }))
    : []

  return (
    <>
      <LineCoverageNotes totals={totals.ok ? totals.data : null} />
      <ReportSection
        title={view === 'matrix' ? 'Menu matrix' : 'What sold'}
        description={
          view === 'matrix'
            ? 'Your dishes sorted by how often they sell and what they earn.'
            : 'Every dish, by net sales after its share of each order’s discount.'
        }
        action={<ViewSwitch context={context} view={view} />}
        isError={!items.ok}
        errorMessage={items.ok ? undefined : items.error.message}
      >
        {items.ok &&
          (view === 'matrix' ? (
            <MenuMatrix context={context} items={items.data} />
          ) : (
            <BreakdownTable
              caption="Net sales by dish"
              nameHeader="Dish"
              countHeader="Sold"
              rows={rows}
              comparePhrase={previousItems?.ok ? (context.compare?.phrase ?? null) : null}
              emptyMessage="No dishes sold in this period."
            />
          ))}
      </ReportSection>
      {/* Basket pairs read the whole store's last 90 days (service role): not
          for a branch-locked account, and not beside one branch's figures. */}
      {context.scope.kind === 'all' && context.branch.branch === null && (
        <Suspense fallback={<PickedTogetherSkeleton />}>
          <PickedTogetherSection tenant={{ id: context.tenantId }} />
        </Suspense>
      )}
    </>
  )
}
