'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { GovDiscountKind } from '@/lib/gov-discount'
import {
  formatManilaDateTime,
  formatPesoCentavos,
  kindCode,
  kindLabel,
  orderReference,
} from '@/lib/gov-discount-reports/format'
import {
  EMPTY_LEDGER_FILTER,
  cashierOptions,
  filterGrants,
  type LedgerFilter,
} from '@/lib/gov-discount-reports/review-queue'
import type { GrantEntry } from '@/lib/gov-discount-reports/types'
import { GovFlagChips } from './gov-flag-chips'
import { GrantStatusBadges } from './grant-status-badges'
import { MaskedId } from './masked-id'

const PAGE = 50

export interface GovLedgerListProps {
  grants: readonly GrantEntry[]
  kinds: readonly GovDiscountKind[]
  /** Grants in the period, when more than the list holds. */
  totalCount: number
  onOpen: (claimId: string) => void
}

function LedgerRow({ grant, onOpen }: { grant: GrantEntry; onOpen: (claimId: string) => void }) {
  const isReversed = grant.reversedAt !== null
  return (
    <li className="relative px-4 py-3 transition-colors hover:bg-muted/40">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => onOpen(grant.id)}
              className={`text-left text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:underline ${
                isReversed ? 'text-muted-foreground line-through decoration-1' : ''
              }`}
            >
              {grant.claimantName}
              <span className="absolute inset-0" aria-hidden />
            </button>
            <Badge variant="secondary" className="text-[11px]" title={kindLabel(grant.kind)}>
              {kindCode(grant.kind)}
            </Badge>
            <GrantStatusBadges grant={grant} />
          </div>
          <div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <MaskedId idNumber={grant.idNumber} claimantName={grant.claimantName} />
            <span aria-hidden>·</span>
            <span>{orderReference(grant)}</span>
            <span aria-hidden>·</span>
            <span>{formatManilaDateTime(grant.occurredAt)}</span>
            <span aria-hidden>·</span>
            <span>{grant.grantedByName}</span>
          </div>
          <GovFlagChips flags={grant.flags} limit={3} />
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-semibold tabular-nums ${isReversed ? 'text-muted-foreground line-through' : ''}`}>
            {formatPesoCentavos(grant.reduction)}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">on {formatPesoCentavos(grant.grossShare)}</p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
    </li>
  )
}

/**
 * Every grant in the period. Filters run in the browser over rows already
 * read under RLS; nothing here can widen what the reader may see.
 */
export function GovLedgerList({ grants, kinds, totalCount, onOpen }: GovLedgerListProps) {
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_LEDGER_FILTER)
  const [visibleCount, setVisibleCount] = useState(PAGE)

  const cashiers = useMemo(() => cashierOptions(grants), [grants])
  const filtered = useMemo(() => filterGrants(grants, filter), [grants, filter])
  const shown = filtered.slice(0, visibleCount)

  const update = (patch: Partial<LedgerFilter>) => {
    setFilter((current) => ({ ...current, ...patch }))
    setVisibleCount(PAGE)
  }
  const isFiltered =
    filter.kind !== 'all' || filter.cashier !== 'all' || filter.flaggedOnly || filter.query.trim() !== ''

  return (
    <section aria-labelledby="gov-ledger-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="gov-ledger-title" className="text-lg font-semibold">
          Every discount given
        </h2>
        <p className="text-sm text-muted-foreground">
          {filtered.length === grants.length
            ? `${grants.length} ${grants.length === 1 ? 'grant' : 'grants'}`
            : `${filtered.length} of ${grants.length}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search by name, ID or order number"
            placeholder="Name, ID or order no."
            value={filter.query}
            onChange={(event) => update({ query: event.target.value })}
            className="pl-9"
          />
        </div>
        <Select value={filter.kind} onValueChange={(value) => update({ kind: value as LedgerFilter['kind'] })}>
          <SelectTrigger className="w-[150px]" aria-label="Discount type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {kinds.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kindLabel(kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cashiers.length > 1 && (
          <Select value={filter.cashier} onValueChange={(value) => update({ cashier: value })}>
            <SelectTrigger className="w-[160px]" aria-label="Cashier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cashiers</SelectItem>
              {cashiers.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
          <Switch
            id="gov-flagged-only"
            checked={filter.flaggedOnly}
            onCheckedChange={(checked) => update({ flaggedOnly: checked })}
          />
          <Label htmlFor="gov-flagged-only" className="text-sm font-normal">
            Flagged only
          </Label>
        </div>
      </div>

      {totalCount > grants.length && (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Showing the newest {grants.length.toLocaleString('en-PH')} of {totalCount.toLocaleString('en-PH')} grants.
          The figures above and the downloads cover all of them — pick a shorter period to browse the rest.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No discounts match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFiltered ? 'Try clearing a filter.' : 'Nothing was given in this period.'}
          </p>
          {isFiltered && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => update(EMPTY_LEDGER_FILTER)}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((grant) => (
            <LedgerRow key={grant.id} grant={grant} onOpen={onOpen} />
          ))}
        </ul>
      )}

      {filtered.length > shown.length && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown.length)} more
          </Button>
        </div>
      )}
    </section>
  )
}
