'use client'

import type { CampaignListItem } from '@/lib/texts/types'
import { campaignChip } from '@/lib/texts/view/chips'
import { cameBackCell, sentCell, whoCell } from '@/lib/texts/view/campaigns'
import { StatusChip } from '../status-chip'
import { useLiveProgress, useTexts } from '../texts-context'
import { CampaignRowMenu } from './campaign-row-menu'

function DesktopRow({ item, onOpen }: { item: CampaignListItem; onOpen: () => void }) {
  const progress = useLiveProgress(item.id)
  return (
    <tr className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40" onClick={onOpen}>
      <td className="max-w-[260px] py-3 pl-4 pr-3">
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen() }} className="block max-w-full text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block truncate">{item.name}</span>
        </button>
        <span className="block truncate text-xs text-muted-foreground">{item.messagePreview}</span>
      </td>
      <td className="px-3 py-3 text-sm tabular-nums">{whoCell(item, progress)}</td>
      <td className="px-3 py-3 text-sm">{item.whenLabel}</td>
      <td className="px-3 py-3"><StatusChip chip={campaignChip(item.displayState)} /></td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">{sentCell(item, progress)}</td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">{cameBackCell(item)}</td>
      <td className="py-3 pl-1 pr-2 text-right"><CampaignRowMenu item={item} /></td>
    </tr>
  )
}

function MobileCard({ item, onOpen }: { item: CampaignListItem; onOpen: () => void }) {
  const progress = useLiveProgress(item.id)
  const sent = sentCell(item, progress)
  const cameBack = cameBackCell(item)
  return (
    <li className="flex items-start gap-2 rounded-2xl border bg-card p-4">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 space-y-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">{item.name}</span>
          <StatusChip chip={campaignChip(item.displayState)} />
        </span>
        <span className="block text-sm text-muted-foreground">{whoCell(item, progress)} · {item.whenLabel}</span>
        {sent !== '—' && (
          <span className="block text-sm tabular-nums">Sent {sent}{cameBack !== '—' ? ` · ${cameBack} came back` : ''}</span>
        )}
      </button>
      <CampaignRowMenu item={item} />
    </li>
  )
}

/** Table on md+, stacked cards below; the whole row opens the campaign. */
export function CampaignList({ items }: { items: CampaignListItem[] }) {
  const { setUrl } = useTexts()
  const open = (item: CampaignListItem) => setUrl({ campaign: item.id, edit: false })
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <table className="w-full text-left">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Campaign</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Who</th>
              <th scope="col" className="px-3 py-2.5 font-medium">When</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Sent</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Came back</th>
              <th scope="col" className="py-2.5 pl-1 pr-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <DesktopRow key={item.id} item={item} onOpen={() => open(item)} />)}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {items.map((item) => <MobileCard key={item.id} item={item} onOpen={() => open(item)} />)}
      </ul>
    </>
  )
}
