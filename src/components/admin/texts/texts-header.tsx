'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ThirtyDayLine } from '@/lib/texts/types'
import { peso } from '@/lib/texts/view/campaigns'
import { useTexts } from './texts-context'

function Stat({ label, value, isHero = false }: { label: string; value: string; isHero?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-wn-stone">{label}</dt>
      <dd className={isHero ? 'text-xl font-semibold tabular-nums text-emerald-800' : 'text-xl font-semibold tabular-nums'}>{value}</dd>
    </div>
  )
}

/** Title, the 30-day result (a stat trio once there is data), and New campaign. */
export function TextsHeader({ thirtyDays }: { thirtyDays: ThirtyDayLine }) {
  const { setUrl } = useTexts()
  const hasData = thirtyDays.sent > 0
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Texts</h1>
          <Button type="button" className="min-h-11 shrink-0 rounded-full sm:hidden" aria-label="New campaign" onClick={() => setUrl({ campaign: 'new', preset: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New
          </Button>
        </div>
        <p className="text-sm text-wn-stone">{hasData ? 'Last 30 days, from your own phone' : 'Bring guests back with texts from your own phone.'}</p>
      </div>
      <div className="flex items-end gap-6">
        {hasData && (
          <dl className="grid flex-1 grid-cols-3 gap-6 rounded-2xl border bg-card px-5 py-3 shadow-[0_1px_2px_rgba(29,24,21,0.04)] sm:flex-none">
            <Stat label="Sent" value={thirtyDays.sent.toLocaleString('en-US')} />
            <Stat label="Came back" value={thirtyDays.cameBack.toLocaleString('en-US')} isHero />
            <Stat label="Their orders" value={peso(thirtyDays.sales)} />
          </dl>
        )}
        <Button type="button" className="hidden min-h-11 shrink-0 rounded-full px-5 sm:inline-flex" onClick={() => setUrl({ campaign: 'new', preset: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New campaign
        </Button>
      </div>
    </header>
  )
}
