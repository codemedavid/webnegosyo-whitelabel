'use client'

import { ChevronRight, CircleCheck } from 'lucide-react'
import { GOV_FLAGS } from '@/lib/gov-discount'
import {
  formatManilaDateTime,
  formatPesoCentavos,
  kindCode,
  orderReference,
} from '@/lib/gov-discount-reports/format'
import type { GrantEntry } from '@/lib/gov-discount-reports/types'
import { GovFlagChips } from './gov-flag-chips'

export interface GovNeedsALookProps {
  grants: readonly GrantEntry[]
  onOpen: (claimId: string) => void
}

const SHOWN = 6

/**
 * The few grants worth the owner's time, newest first: still standing, a
 * high or medium flag, and nobody has reviewed them. Marking one OK or a
 * problem takes it off this list.
 */
export function GovNeedsALook({ grants, onOpen }: GovNeedsALookProps) {
  if (grants.length === 0) {
    return (
      <section
        aria-labelledby="gov-needs-a-look-title"
        className="flex items-start gap-3 rounded-xl border bg-card p-5"
      >
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <h2 id="gov-needs-a-look-title" className="font-semibold">
            Nothing needs a look
          </h2>
          <p className="text-sm text-muted-foreground">
            Every Senior/PWD discount in this period matched the rules, or has already been reviewed.
          </p>
        </div>
      </section>
    )
  }

  const shown = grants.slice(0, SHOWN)

  return (
    <section
      aria-labelledby="gov-needs-a-look-title"
      className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 dark:border-amber-900 dark:bg-amber-950/20"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="gov-needs-a-look-title" className="font-semibold">
          Needs a look <span className="text-muted-foreground">({grants.length})</span>
        </h2>
        <p className="text-sm text-muted-foreground">Open one to see why, then mark it OK or a problem.</p>
      </div>

      <ul className="mt-4 divide-y rounded-lg border bg-card">
        {shown.map((grant) => {
          const topFlag = grant.flags[0]
          return (
            <li key={grant.id}>
              <button
                type="button"
                onClick={() => onOpen(grant.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium">{grant.claimantName}</span>
                    <span className="text-muted-foreground">
                      {kindCode(grant.kind)} · {orderReference(grant)} · {formatManilaDateTime(grant.occurredAt)} ·{' '}
                      {grant.grantedByName}
                    </span>
                  </div>
                  <GovFlagChips flags={grant.flags} />
                  {topFlag && <p className="text-xs text-muted-foreground">{GOV_FLAGS[topFlag].explain}</p>}
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatPesoCentavos(grant.reduction)}</span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
      {grants.length > SHOWN && (
        <p className="mt-3 text-sm text-muted-foreground">
          {grants.length - SHOWN} more below — turn on &ldquo;Flagged only&rdquo; in the list.
        </p>
      )}
    </section>
  )
}
