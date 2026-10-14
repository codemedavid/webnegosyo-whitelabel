'use client'

import { CalendarClock, Check, Repeat, Users } from 'lucide-react'
import type { CampaignListItem, CampaignRunProgress } from '@/lib/texts/types'
import { campaignChip } from '@/lib/texts/view/chips'
import { peso, whoCell } from '@/lib/texts/view/campaigns'
import { renderSample } from '@/lib/texts/view/message'
import { StatusChip, Meter } from '../status-chip'
import { useLiveProgress, useTexts } from '../texts-context'
import { CampaignRowMenu } from './campaign-row-menu'

function WhenIcon({ item }: { item: CampaignListItem }) {
  if (item.displayState === 'sent' || item.displayState === 'finished') return <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
  if (item.schedule.kind !== 'one_off') return <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
  if (item.nextSendAt) return <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
  return null
}

function MessageLine({ item }: { item: CampaignListItem }) {
  const { storeName } = useTexts()
  const text = renderSample(item.messageTemplate, storeName, null)
  return text
    ? <span className="block truncate text-[13px] text-wn-stone">{text}</span>
    : <span className="block text-[13px] italic text-wn-stone/80">No message yet</span>
}

/** "64 / 212" with a thin bar while sending; the plain count after. */
function SentCell({ item, progress }: { item: CampaignListItem; progress: CampaignRunProgress | null }) {
  if (progress) {
    return (
      <span className="block min-w-24 space-y-1.5">
        <span className="block text-sm tabular-nums"><span className="font-semibold">{progress.sent.toLocaleString('en-US')}</span><span className="text-wn-stone"> / {progress.total.toLocaleString('en-US')}</span></span>
        <Meter ratio={progress.total > 0 ? (progress.sent + progress.notSent) / progress.total : 0} tone={progress.isWaitingForPhone ? 'amber' : 'emerald'} />
      </span>
    )
  }
  if (item.results && item.results.sent > 0) return <span className="text-sm font-medium tabular-nums">{item.results.sent.toLocaleString('en-US')}</span>
  return <span className="text-sm text-stone-400">—</span>
}

/** "18 came back · ₱6,420", the number that matters in emerald. */
function CameBack({ item, isStacked = false }: { item: CampaignListItem; isStacked?: boolean }) {
  const results = item.results
  if (!results || results.sent === 0) return <span className="text-sm text-stone-400">—</span>
  return (
    <span className={isStacked ? 'block text-sm leading-tight tabular-nums' : 'text-sm tabular-nums'}>
      <span className={isStacked ? 'block font-semibold text-emerald-800' : 'font-semibold text-emerald-800'}>{results.isApproximate ? 'at least ' : ''}{results.cameBack.toLocaleString('en-US')} came back</span>
      {results.sales > 0 && (
        <span className={isStacked ? 'mt-0.5 block text-xs text-wn-stone' : 'text-wn-stone'}>
          {isStacked ? <span className="sr-only">, </span> : <span aria-hidden="true"> · </span>}{peso(results.sales)}{isStacked ? ' in orders' : ''}
        </span>
      )}
    </span>
  )
}

function DesktopRow({ item, onOpen }: { item: CampaignListItem; onOpen: () => void }) {
  const progress = useLiveProgress(item.id)
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-wn-sand/70" onClick={onOpen}>
      <td className="max-w-[220px] py-3.5 pl-5 pr-3">
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen() }} className="block max-w-full rounded text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block truncate group-hover:underline group-hover:decoration-wn-line group-hover:underline-offset-4">{item.name}</span>
        </button>
        <MessageLine item={item} />
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-sm tabular-nums">{whoCell(item, progress)}</td>
      <td className="px-3 py-3.5 text-sm"><span className="flex items-center gap-1.5 whitespace-nowrap text-foreground/80"><WhenIcon item={item} />{item.whenLabel}</span></td>
      <td className="px-3 py-3.5"><StatusChip chip={campaignChip(item.displayState)} /></td>
      <td className="px-3 py-3.5 text-right"><SentCell item={item} progress={progress} /></td>
      <td className="whitespace-nowrap px-3 py-3.5"><CameBack item={item} isStacked /></td>
      <td className="py-3.5 pl-1 pr-3 text-right"><CampaignRowMenu item={item} /></td>
    </tr>
  )
}

function MobileCard({ item, onOpen }: { item: CampaignListItem; onOpen: () => void }) {
  const progress = useLiveProgress(item.id)
  return (
    <li className="relative rounded-2xl border bg-card shadow-[0_1px_2px_rgba(29,24,21,0.04)] transition-transform active:scale-[0.99] motion-reduce:transition-none">
      <button type="button" onClick={onOpen} className="block w-full space-y-2.5 rounded-2xl p-4 pr-14 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate font-semibold">{item.name}</span>
          <StatusChip chip={campaignChip(item.displayState)} />
        </span>
        <MessageLine item={item} />
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-foreground/80">
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" />{whoCell(item, progress)}</span>
          {item.whenLabel !== '—' && <span className="flex items-center gap-1.5"><WhenIcon item={item} />{item.whenLabel}</span>}
        </span>
        {progress && <SentCell item={item} progress={progress} />}
        {!progress && item.results && item.results.sent > 0 && (
          <span className="block border-t border-wn-line pt-2.5 text-sm"><span className="tabular-nums">Sent {item.results.sent.toLocaleString('en-US')}</span> · <CameBack item={item} /></span>
        )}
      </button>
      <span className="absolute right-1.5 top-1.5"><CampaignRowMenu item={item} /></span>
    </li>
  )
}

/** Table on md+, native-feeling cards below; the whole row opens the campaign. */
export function CampaignList({ items }: { items: CampaignListItem[] }) {
  const { setUrl } = useTexts()
  const open = (item: CampaignListItem) => setUrl({ campaign: item.id, edit: false })
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-[0_1px_2px_rgba(29,24,21,0.04)] md:block">
        <table className="w-full text-left">
          <thead className="border-b border-wn-line bg-wn-sand/60 text-[11px] font-medium uppercase tracking-wide text-wn-stone">
            <tr>
              <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Campaign</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Who</th>
              <th scope="col" className="px-3 py-2.5 font-medium">When</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Sent</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Results</th>
              <th scope="col" className="py-2.5 pl-1 pr-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-wn-line">
            {items.map((item) => <DesktopRow key={item.id} item={item} onOpen={() => open(item)} />)}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {items.map((item) => <MobileCard key={item.id} item={item} onOpen={() => open(item)} />)}
      </ul>
    </>
  )
}
