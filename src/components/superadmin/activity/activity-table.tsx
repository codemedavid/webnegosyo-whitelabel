'use client'

/**
 * Every store's orders in the chosen window.
 *
 * Defaults to the stores that actually traded — the question the screen is
 * opened for — with a switch to see the quiet ones too. A store whose backend
 * could not be read says so instead of showing a zero.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { TenantActivityRow } from '@/lib/activity/tenant-activity'
import { lastOrderLabel } from '@/lib/activity/last-order-label'
import { formatCurrency, formatNumber } from '@/components/superadmin/ui/format'

type SortKey = 'orders' | 'revenue' | 'avg' | 'lastOrder' | 'name'

const BACKEND_LABELS: Record<TenantActivityRow['backend'], string> = {
  platform: 'Platform',
  convex: 'Convex',
  supabase: 'Own Supabase',
}

function compareBy(key: SortKey): (a: TenantActivityRow, b: TenantActivityRow) => number {
  switch (key) {
    case 'revenue':
      return (a, b) => b.revenue - a.revenue
    case 'avg':
      return (a, b) => b.avgOrderValue - a.avgOrderValue
    case 'lastOrder':
      return (a, b) => (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? '')
    case 'name':
      return (a, b) => a.name.localeCompare(b.name)
    case 'orders':
      return (a, b) => b.orders - a.orders || b.revenue - a.revenue
  }
}

function formatInstant(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

interface ActivityTableProps {
  rows: TenantActivityRow[]
  /** The report's read time, so relative labels agree with the server. */
  nowIso: string
}

export function ActivityTable({ rows, nowIso }: ActivityTableProps) {
  const [query, setQuery] = useState('')
  const [isShowingQuiet, setIsShowingQuiet] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('orders')

  const quietCount = useMemo(
    () => rows.filter((row) => row.source !== 'ok' || row.orders === 0).length,
    [rows]
  )

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows
      .filter((row) => isShowingQuiet || (row.source === 'ok' && row.orders > 0))
      .filter(
        (row) =>
          needle === '' ||
          row.name.toLowerCase().includes(needle) ||
          row.slug.toLowerCase().includes(needle)
      )
      .sort(compareBy(sortKey))
  }, [rows, query, isShowingQuiet, sortKey])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stores…"
          aria-label="Search stores"
          className="w-full max-w-xs rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={isShowingQuiet}
            onChange={(event) => setIsShowingQuiet(event.target.checked)}
            className="h-4 w-4 accent-white"
          />
          Include stores with no orders ({quietCount})
        </label>
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 px-4 py-12 text-center text-sm text-white/55">
          {isShowingQuiet || query ? 'No stores match.' : 'No store took an order in this period.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-left text-[11px] font-semibold uppercase tracking-wider text-white/45">
                <th className="w-10 px-4 py-2.5">#</th>
                <SortHeader label="Store" sortKey="name" current={sortKey} onSort={setSortKey} />
                <SortHeader
                  label="Orders"
                  sortKey="orders"
                  current={sortKey}
                  onSort={setSortKey}
                  align="right"
                />
                <SortHeader
                  label="Revenue"
                  sortKey="revenue"
                  current={sortKey}
                  onSort={setSortKey}
                  align="right"
                />
                <SortHeader
                  label="Avg order"
                  sortKey="avg"
                  current={sortKey}
                  onSort={setSortKey}
                  align="right"
                />
                <th className="px-4 py-2.5 text-right">Cancelled</th>
                <SortHeader
                  label="Last order"
                  sortKey="lastOrder"
                  current={sortKey}
                  onSort={setSortKey}
                />
                <th className="px-4 py-2.5">Backend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {visibleRows.map((row, index) => (
                <tr key={row.tenantId} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 tabular-nums text-white/40">{index + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/superadmin/tenants/${row.tenantId}`}
                      className="font-medium text-white hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-xs text-white/45">
                      /{row.slug}
                      {!row.isActive && <span className="ml-2 text-amber-300/80">· inactive</span>}
                    </div>
                  </td>
                  {row.source === 'ok' ? (
                    <>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">
                        {formatNumber(row.orders)}
                        {row.isTruncated && (
                          <span title="Convex stopped counting at its scan limit; the real number is higher.">
                            +
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/80">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/60">
                        {row.orders > 0 ? formatCurrency(row.avgOrderValue) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/60">
                        {row.cancelled > 0 ? formatNumber(row.cancelled) : '—'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-4 py-3 text-right text-xs text-amber-300/90">
                      {row.source === 'unsupported'
                        ? 'Not readable here (own Supabase project)'
                        : `Couldn't reach backend${row.error ? ` — ${row.error}` : ''}`}
                    </td>
                  )}
                  <td
                    className="whitespace-nowrap px-4 py-3 text-white/60"
                    title={formatInstant(row.lastOrderAt)}
                  >
                    {row.source === 'ok' ? lastOrderLabel(row.lastOrderAt, nowIso) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/45">{BACKEND_LABELS[row.backend]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  current,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const isActive = current === sortKey
  return (
    <th
      className={`px-4 py-2.5 ${align === 'right' ? 'text-right' : ''}`}
      aria-sort={isActive ? (sortKey === 'name' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`uppercase tracking-wider transition-colors ${
          isActive ? 'text-white' : 'hover:text-white/80'
        }`}
      >
        {label}
        {isActive ? (sortKey === 'name' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )
}
