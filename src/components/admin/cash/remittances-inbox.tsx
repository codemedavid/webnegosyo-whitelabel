'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Remittance } from '@/lib/cash/remittances'
import { clockLabel, dayLabel, formatMoney } from './cash-format'
import { RemittanceSheet } from './remittance-sheet'
import { remitStatus } from './shifts-model'

export interface RemittancesInboxProps {
  toAccept: Remittance[]
  disputed: Remittance[]
  answered: Remittance[]
  day: string
  tenantSlug: string
  viewerUserId: string
  canResolve: boolean
  outletNames: Record<string, string>
}

const TONES = {
  ok: 'text-emerald-800',
  bad: 'text-red-800',
  warn: 'text-amber-900',
  muted: 'text-wn-stone',
} as const

function Row({ remittance, onOpen, outletNames }: { remittance: Remittance; onOpen: () => void; outletNames: Record<string, string> }) {
  const status = remitStatus(remittance)
  const branch = remittance.outletId ? outletNames[remittance.outletId] : null
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-wn-sand/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wn-ink"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-wn-ink">
            {remittance.cashierName}
            <span className="ml-2 text-[12.5px] font-semibold text-wn-stone">{remittance.kind === 'pickup' ? 'Pickup' : 'End of shift'}</span>
          </span>
          <span className="block text-[13px] text-wn-stone tabular-nums">
            {[remittance.businessDay ? dayLabel(remittance.businessDay) : null, clockLabel(remittance.createdAt), branch].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[15px] font-extrabold text-wn-ink tabular-nums">{formatMoney(remittance.handedOverCents, { centavos: true })}</span>
          <span className={`block text-[12.5px] font-semibold ${TONES[status.tone]}`}>{status.text}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-wn-stone" aria-hidden />
      </button>
    </li>
  )
}

function Group({ title, empty, items, onOpen, outletNames }: { title: string; empty: string | null; items: Remittance[]; onOpen: (r: Remittance) => void; outletNames: Record<string, string> }) {
  if (items.length === 0 && empty === null) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-wn-stone">
        {title}
        {items.length > 0 && <span className="ml-1.5 tabular-nums">({items.length})</span>}
      </h2>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-white px-5 py-6 text-[14px] text-wn-stone ring-1 ring-border">{empty}</p>
      ) : (
        <ul className="divide-y divide-wn-line overflow-hidden rounded-2xl bg-white ring-1 ring-border">
          {items.map((remittance) => (
            <Row key={remittance.id} remittance={remittance} onOpen={() => onOpen(remittance)} outletNames={outletNames} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** "To accept": waiting remittances first, then disputes, then what was answered on the day shown. */
export function RemittancesInbox({ toAccept, disputed, answered, day, tenantSlug, viewerUserId, canResolve, outletNames }: RemittancesInboxProps) {
  const [open, setOpen] = useState<Remittance | null>(null)
  const totalWaiting = toAccept.reduce((sum, remittance) => sum + remittance.handedOverCents, 0)
  return (
    <>
      {toAccept.length > 0 && (
        <p className="text-[14px] text-wn-ink tabular-nums">
          <b>{toAccept.length}</b> to accept · <b>{formatMoney(totalWaiting, { centavos: true })}</b>
        </p>
      )}
      <Group title="To accept" empty="Nothing to accept. When a cashier remits, it shows here." items={toAccept} onOpen={setOpen} outletNames={outletNames} />
      <Group title="Disputed" empty={null} items={disputed} onOpen={setOpen} outletNames={outletNames} />
      <Group title={`Answered · ${dayLabel(day)}`} empty={null} items={answered} onOpen={setOpen} outletNames={outletNames} />
      <RemittanceSheet
        remittance={open}
        onClose={() => setOpen(null)}
        tenantSlug={tenantSlug}
        viewerUserId={viewerUserId}
        canResolve={canResolve}
        outletNames={outletNames}
      />
    </>
  )
}
