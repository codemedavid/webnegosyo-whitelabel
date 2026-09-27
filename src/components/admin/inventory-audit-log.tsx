'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, CopyX, History, Search, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  AUDIT_OUTCOME_LABELS,
  describeAuditEntry,
  formatAuditLineQuantity,
  type AuditFilters,
  type AuditSummary,
  type AuditTone,
} from '@/lib/inventory/stock-audit'
import type { InventoryAuditEntry } from '@/lib/inventory/stock-audit-read'

interface InventoryAuditLogProps {
  basePath: string
  entries: InventoryAuditEntry[]
  summary: AuditSummary
  filters: AuditFilters
  /** Stock-unit abbreviation per ingredient id, for the quantities. */
  unitByItemId: Record<string, string>
  loadFailed: boolean
}

const TONE_CLASSES: Record<AuditTone, string> = {
  neutral: 'border-border',
  warning: 'border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30',
  error: 'border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30',
}

/**
 * Seconds matter here — two deductions of one order land seconds apart — and
 * locale formatting must run on the client only (SSR locale text is a
 * hydration bug this codebase has shipped twice). The server emits the machine
 * timestamp, which hydrates cleanly, and the browser swaps in local time.
 */
function Timestamp({ iso }: { iso: string }) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])
  const label = isMounted
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    : iso.slice(0, 19).replace('T', ' ')
  return (
    <time dateTime={iso} suppressHydrationWarning className="text-xs text-muted-foreground tabular-nums">
      {label}
    </time>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: AuditTone }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2', value > 0 ? TONE_CLASSES[tone] : 'border-border')}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function EntryCard({
  entry,
  basePath,
  unitByItemId,
}: {
  entry: InventoryAuditEntry
  basePath: string
  unitByItemId: Record<string, string>
}) {
  const view = describeAuditEntry(entry)
  const Icon = view.tone === 'error' ? XCircle : view.tone === 'warning' ? CopyX : CheckCircle2
  return (
    <li className={cn('rounded-lg border p-3', TONE_CLASSES[view.tone])}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{view.title}</p>
            <p className="text-sm text-muted-foreground">{view.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={view.tone === 'neutral' ? 'secondary' : 'outline'}>
            {AUDIT_OUTCOME_LABELS[entry.outcome]}
          </Badge>
          <Timestamp iso={entry.createdAt} />
        </div>
      </div>

      {entry.lines.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-sm">
          {entry.lines.map((line, index) => (
            <li key={`${line.inventoryItemId}-${index}`}>
              {line.name ?? 'Removed ingredient'}{' '}
              <span className="tabular-nums font-medium">
                {formatAuditLineQuantity(line.quantityDelta, unitByItemId[line.inventoryItemId] ?? null)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {entry.orderId && (
        <div className="mt-2 pl-6">
          <Link
            href={`${basePath}?order=${encodeURIComponent(entry.orderId)}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            Everything for order {entry.orderId}
          </Link>
        </div>
      )}
    </li>
  )
}

export function InventoryAuditLog({
  basePath,
  entries,
  summary,
  filters,
  unitByItemId,
  loadFailed,
}: InventoryAuditLogProps) {
  const isFiltered = filters.orderQuery !== null || filters.problemsOnly
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryTile label="Order deductions" value={summary.deductions} tone="neutral" />
        <SummaryTile label="Restored (cancelled)" value={summary.restores} tone="neutral" />
        <SummaryTile label="Second deductions refused" value={summary.duplicatesRefused} tone="warning" />
        <SummaryTile label="Repeated manual entries" value={summary.suspectedRepeats} tone="warning" />
        <SummaryTile label="Failed" value={summary.failures} tone="error" />
      </div>

      <form action={basePath} method="get" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            name="order"
            defaultValue={filters.orderQuery ?? ''}
            placeholder="Find an order id"
            aria-label="Find an order id"
            className="pl-8"
          />
        </div>
        {filters.problemsOnly && <input type="hidden" name="view" value="problems" />}
        <Button type="submit" variant="secondary">Search</Button>
        <Button asChild variant={filters.problemsOnly ? 'default' : 'outline'}>
          <Link href={filters.problemsOnly ? basePath : `${basePath}?view=problems`}>
            <AlertTriangle className="mr-1 h-4 w-4" aria-hidden />
            Problems only
          </Link>
        </Button>
        {isFiltered && (
          <Button asChild variant="ghost">
            <Link href={basePath}>Clear</Link>
          </Button>
        )}
      </form>

      {loadFailed ? (
        <Card>
          <CardContent className="py-6 text-sm text-red-600">
            The stock log could not be read right now. Nothing has been lost — try again in a moment.
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <History className="h-4 w-4" aria-hidden />
            {isFiltered
              ? 'Nothing matches this search.'
              : 'No stock activity has been logged yet. Every sale, cancellation and manual change will appear here from now on.'}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} basePath={basePath} unitByItemId={unitByItemId} />
          ))}
        </ul>
      )}
    </div>
  )
}
