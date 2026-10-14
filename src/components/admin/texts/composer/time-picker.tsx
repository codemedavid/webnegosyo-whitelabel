'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { sendableTimes } from '@/lib/texts/view/composer-draft'
import { RadioChips } from '../radio-chips'
import { useTexts } from '../texts-context'

const TIME_PRESETS = [
  { value: '09:00', label: 'Morning', description: '9 AM' },
  { value: '10:00', label: 'Before lunch', description: '10 AM' },
  { value: '15:00', label: 'Afternoon', description: '3 PM' },
  { value: '17:00', label: 'Before dinner', description: '5 PM' },
] as const

/** Sensible times outside quiet hours, plus "Pick a time" bounded to the sendable day. Philippine time. */
export function TimePicker({ value, onChange, describedBy }: { value: string; onChange: (value: string) => void; describedBy?: string }) {
  const { rules } = useTexts()
  const id = useId()
  const options = sendableTimes(TIME_PRESETS, rules)
  const isPreset = options.some((preset) => preset.value === value)
  // Quiet hours wrap midnight, so the sendable day is [end, start).
  const wraps = rules.quietHoursStart > rules.quietHoursEnd
  return (
    <div className="space-y-3">
      <RadioChips label="Time, Philippine time" size="card" options={options} value={isPreset ? value : null} onChange={onChange} className="grid grid-cols-2" />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm text-wn-stone">Or pick a time</label>
        <Input
          id={id}
          type="time"
          value={value}
          min={wraps ? rules.quietHoursEnd : undefined}
          max={wraps ? rules.quietHoursStart : undefined}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          className="h-11 w-36 bg-white sm:h-10"
        />
        <span className="text-xs text-wn-stone">Philippine time</span>
      </div>
    </div>
  )
}
