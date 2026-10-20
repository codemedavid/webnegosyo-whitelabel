'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CampaignReportGuest } from '@/lib/texts/types'
import { activityChip } from '@/lib/texts/view/chips'
import { peso } from '@/lib/texts/view/campaigns'
import { clockText, monthDayOf, toMs } from '@/lib/texts/view/time'
import { StatusChip } from '../status-chip'
import { runAction } from '../run-action'
import { useTexts } from '../texts-context'
import { useTextsActions } from '../texts-actions'

function when(iso: string | null): string {
  const at = toMs(iso)
  return at === null ? '' : `${monthDayOf(at)}, ${clockText(at)}`
}

function GuestRow({ guest }: { guest: CampaignReportGuest }) {
  const status = guest.status === 'waiting' ? 'queued' : guest.status === 'sent' ? 'sent' : 'failed'
  const ordered = toMs(guest.orderedAt)
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wn-sand text-xs font-semibold text-wn-stone ring-1 ring-wn-line" aria-hidden="true">{guest.label.trim().charAt(0).toUpperCase()}</span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{guest.label}</span>
        {guest.sentAt && <span className="block text-xs text-wn-stone">Sent {when(guest.sentAt)}</span>}
        {ordered !== null && (
          <span className="block text-xs font-medium text-emerald-800">Ordered {monthDayOf(ordered)}{guest.orderTotal !== null ? ` · ${peso(guest.orderTotal)}` : ''}</span>
        )}
        {guest.reason && <span className="block text-xs text-wn-stone">{guest.reason}</span>}
      </span>
      <StatusChip chip={activityChip(status)} />
    </li>
  )
}

/** Fifty at a time; names masked, numbers never whole. */
export function GuestsList({ campaignId, initial, initialCursor }: { campaignId: string; initial: CampaignReportGuest[]; initialCursor: string | null }) {
  const { tenantId } = useTexts()
  const [extra, setExtra] = useState<CampaignReportGuest[]>([])
  const [cursor, setCursor] = useState(initialCursor)
  const [isLoading, setLoading] = useState(false)
  const actions = useTextsActions()
  const guests = [...initial, ...extra]

  const loadMore = async () => {
    if (!cursor) return
    setLoading(true)
    const page = await runAction(() => actions.getCampaignReportAction(tenantId, campaignId, cursor), "Couldn't load more guests. Try again.")
    setLoading(false)
    if (!page) return
    setExtra((prev) => [...prev, ...page.guests])
    setCursor(page.nextCursor)
  }

  if (guests.length === 0) return null
  return (
    <section aria-labelledby="campaign-guests" className="space-y-2">
      <h3 id="campaign-guests" className="text-xs font-medium uppercase tracking-wide text-wn-stone">Guests</h3>
      <ul className="divide-y divide-wn-line rounded-2xl border border-wn-line bg-white px-4 shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
        {guests.map((guest, index) => <GuestRow key={`${guest.label}-${index}`} guest={guest} />)}
      </ul>
      {cursor && (
        <Button type="button" variant="outline" className="min-h-11 w-full sm:min-h-9" onClick={() => void loadMore()} disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
        </Button>
      )}
    </section>
  )
}
