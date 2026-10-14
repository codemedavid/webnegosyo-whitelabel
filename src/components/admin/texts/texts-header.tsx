'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ThirtyDayLine } from '@/lib/texts/types'
import { peso } from '@/lib/texts/view/campaigns'
import { useTexts } from './texts-context'

function resultLine(line: ThirtyDayLine): string {
  if (line.sent === 0) return 'Bring guests back with texts from your own phone.'
  const parts = [`${line.sent.toLocaleString('en-US')} sent`, `${line.cameBack.toLocaleString('en-US')} came back`]
  if (line.sales > 0) parts.push(`${peso(line.sales)} in orders`)
  return `Last 30 days: ${parts.join(' · ')}`
}

export function TextsHeader({ thirtyDays }: { thirtyDays: ThirtyDayLine }) {
  const { setUrl } = useTexts()
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">Texts</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">{resultLine(thirtyDays)}</p>
      </div>
      <Button
        type="button"
        className="min-h-11 shrink-0 rounded-full sm:min-h-9"
        aria-label="New campaign"
        onClick={() => setUrl({ campaign: 'new', preset: null })}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="sm:hidden">New</span>
        <span className="hidden sm:inline">New campaign</span>
      </Button>
    </header>
  )
}
