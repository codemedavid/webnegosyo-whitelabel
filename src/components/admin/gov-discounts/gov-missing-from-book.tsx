'use client'

import { useState, useTransition } from 'react'
import { FileWarning } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { recordMissingGovOrderAction } from '@/app/actions/gov-discount-missing'
import { formatManilaDateTime, formatPesoCentavos } from '@/lib/gov-discount-reports/format'
import type { MissingOrder } from '@/lib/gov-discount-ledger/missing-from-book'

export interface GovMissingFromBookProps {
  tenantId: string
  tenantSlug: string
  orders: readonly MissingOrder[]
}

const SHOWN = 10

/**
 * Orders that gave a Senior/PWD discount but never reached the sales book
 * (an online order's record failed). "Record now" files it from the order as
 * stored, re-priced by the server — the owner never types an amount.
 */
export function GovMissingFromBook({ tenantId, tenantSlug, orders }: GovMissingFromBookProps) {
  const [recorded, setRecorded] = useState<ReadonlySet<string>>(new Set())
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const remaining = orders.filter((order) => !recorded.has(order.orderId))
  if (remaining.length === 0) return null

  function recordNow(orderId: string) {
    setPendingId(orderId)
    startTransition(async () => {
      const result = await recordMissingGovOrderAction({ tenantId, tenantSlug, orderId })
      setPendingId(null)
      if (!result.success) {
        toast.error(result.error ?? 'We could not record it. Please try again.')
        return
      }
      setRecorded((current) => new Set([...current, orderId]))
      toast.success('Recorded in the sales book.')
    })
  }

  return (
    <section
      aria-labelledby="gov-missing-title"
      data-testid="gov-missing-from-book"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
    >
      <div className="flex items-start gap-3">
        <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <h2 id="gov-missing-title" className="font-semibold">
            Missing from sales book <span className="text-muted-foreground">({remaining.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            These orders gave a Senior/PWD discount, but it was never written to your sales book. Record each one
            so your BIR books are complete.
          </p>
        </div>
      </div>
      <ul className="mt-4 divide-y rounded-lg border bg-card">
        {remaining.slice(0, SHOWN).map((order) => (
          <li key={order.orderId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">
                {order.label ?? 'Order'} · {formatPesoCentavos(order.reduction)} off
              </p>
              <p className="text-sm text-muted-foreground">
                {formatManilaDateTime(order.occurredAt)} · {order.claimantCount}{' '}
                {order.claimantCount === 1 ? 'claimant' : 'claimants'}
              </p>
            </div>
            <Button size="sm" onClick={() => recordNow(order.orderId)} disabled={pendingId !== null}>
              {pendingId === order.orderId ? 'Recording…' : 'Record now'}
            </Button>
          </li>
        ))}
      </ul>
      {remaining.length > SHOWN && (
        <p className="mt-2 text-sm text-muted-foreground">Record these first; the rest will show next.</p>
      )}
    </section>
  )
}
