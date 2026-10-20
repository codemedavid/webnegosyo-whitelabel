'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AudienceFilter } from '@/lib/texts/types'

type NumberKey = 'lastOrderOlderThanDays' | 'lastOrderWithinDays' | 'minOrderCount' | 'maxOrderCount' | 'minTotalSpent'

function NumberField({ label, suffix, value, onChange, max }: {
  label: string; suffix?: string; value: number | undefined; onChange: (value: number | undefined) => void; max: number
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value ?? ''}
          placeholder="Any"
          onChange={(event) => {
            const raw = event.target.value
            if (raw === '') return onChange(undefined)
            const parsed = Math.max(0, Math.min(max, Math.floor(Number(raw))))
            onChange(Number.isFinite(parsed) ? parsed : undefined)
          }}
          className="h-11 w-28 tabular-nums sm:h-9"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}

/** "Customize who": editing any field turns the chip into Custom. */
export function CustomAudience({ audience, onChange }: { audience: AudienceFilter; onChange: (next: AudienceFilter) => void }) {
  const set = (key: NumberKey) => (value: number | undefined) => {
    const next: AudienceFilter = { ...audience }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange(next)
  }
  return (
    <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
      <NumberField label="Last order more than" suffix="days ago" value={audience.lastOrderOlderThanDays} onChange={set('lastOrderOlderThanDays')} max={365} />
      <NumberField label="Ordered in the last" suffix="days" value={audience.lastOrderWithinDays} onChange={set('lastOrderWithinDays')} max={365} />
      <NumberField label="At least" suffix="orders" value={audience.minOrderCount} onChange={set('minOrderCount')} max={1000} />
      <NumberField label="At most" suffix="orders" value={audience.maxOrderCount} onChange={set('maxOrderCount')} max={1000} />
      <NumberField label="Spent at least (₱)" value={audience.minTotalSpent} onChange={set('minTotalSpent')} max={1_000_000} />
    </div>
  )
}
