'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { RadioChips } from '../radio-chips'

const TIME_PRESETS = [
  { value: '09:00', label: 'Morning', description: '9 AM' },
  { value: '10:00', label: 'Before lunch', description: '10 AM' },
  { value: '15:00', label: 'Afternoon', description: '3 PM' },
  { value: '17:00', label: 'Before dinner', description: '5 PM' },
] as const

/** Four sensible times plus "Pick a time"; all in Philippine time. */
export function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  const isPreset = TIME_PRESETS.some((preset) => preset.value === value)
  return (
    <div className="space-y-2">
      <RadioChips label="Time, Philippine time" size="card" options={TIME_PRESETS} value={isPreset ? value : null} onChange={onChange} />
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs text-muted-foreground">Pick a time</label>
        <Input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-36 sm:h-9" />
        <span className="text-xs text-muted-foreground">Philippine time</span>
      </div>
    </div>
  )
}
