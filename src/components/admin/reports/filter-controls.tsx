'use client'

import { useId, useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { customRangeError } from './custom-range'

/** 44px tall controls (WCAG 2.5.8 / plan §4). Overrides the primitives' h-9. */
export const TARGET_44 = 'min-h-11 data-[size=default]:h-11'

export interface FilterOption {
  value: string
  label: string
}

/** Radix Select can't hold an empty value, so "All branches" needs a token. */
export const ALL_BRANCHES = '__all__'

interface BranchSelectProps {
  branches: FilterOption[]
  value: string | null
  onChange: (branch: string | null) => void
  /** Show a visible label above (inside the sheet). */
  hasVisibleLabel?: boolean
}

export function BranchSelect({ branches, value, onChange, hasVisibleLabel = false }: BranchSelectProps) {
  const labelId = useId()
  const current = branches.find((branch) => branch.value === value)?.label ?? 'All branches'
  return (
    <div className={cn(hasVisibleLabel && 'flex flex-col gap-1.5')}>
      <Label id={labelId} className={cn(!hasVisibleLabel && 'sr-only')}>
        Branch
      </Label>
      <Select value={value ?? ALL_BRANCHES} onValueChange={(next) => onChange(next === ALL_BRANCHES ? null : next)}>
        <SelectTrigger aria-labelledby={labelId} className={cn(TARGET_44, hasVisibleLabel ? 'w-full' : 'min-w-40')}>
          <SelectValue>{current}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.value} value={branch.value}>
              {branch.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Branch accounts see their own branch only; the chip says so instead of offering a choice. */
export function LockedBranchChip({ label }: { label?: string }) {
  return (
    <span
      title="This account sees its own branch only"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-wn-sand px-3.5 text-[13px] font-semibold text-wn-ink ring-1 ring-wn-line"
    >
      <Lock className="size-3.5 text-wn-stone" aria-hidden />
      Your branch{label ? ` · ${label}` : ''}
      <span className="sr-only"> (locked)</span>
    </span>
  )
}

export function CompareSwitch({ isOn, onChange }: { isOn: boolean; onChange: (isOn: boolean) => void }) {
  const id = useId()
  return (
    // The whole label is the 44px target; the switch itself stays small.
    <Label
      htmlFor={id}
      className="min-h-11 cursor-pointer rounded-lg px-3 text-[13px] font-semibold text-wn-ink hover:bg-wn-sand"
    >
      <Switch id={id} checked={isOn} onCheckedChange={onChange} />
      Compare
    </Label>
  )
}

interface CustomRangeFieldsProps {
  initialFrom: string | null
  initialTo: string | null
  today: string
  maxDays: number
  onApply: (range: { from: string; to: string }) => void
  /** inline = one row in the desktop bar; stacked = the phone sheet. */
  layout: 'inline' | 'stacked'
}

/** Two native date inputs + Apply. Nothing navigates until the range is valid. */
export function CustomRangeFields({ initialFrom, initialTo, today, maxDays, onApply, layout }: CustomRangeFieldsProps) {
  const [from, setFrom] = useState(initialFrom ?? today)
  const [to, setTo] = useState(initialTo ?? today)
  const [error, setError] = useState<string | null>(null)
  const fromId = useId()
  const toId = useId()
  const errorId = useId()
  const isStacked = layout === 'stacked'

  const apply = () => {
    const problem = customRangeError({ from, to, today, maxDays })
    setError(problem)
    if (!problem) onApply({ from, to })
  }

  const field = (id: string, label: string, value: string, onChange: (next: string) => void) => (
    <div className={cn('flex flex-col gap-1', !isStacked && 'flex-row items-center gap-2')}>
      <Label htmlFor={id} className="text-[13px] font-semibold text-wn-stone">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        max={today}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          onChange(event.target.value)
          setError(null)
        }}
        className={cn('h-11 tabular-nums', isStacked ? 'w-full' : 'w-[10.5rem]')}
      />
    </div>
  )

  return (
    <div
      role="group"
      aria-label="Custom dates"
      className={cn('flex gap-2', isStacked ? 'flex-col' : 'flex-wrap items-center')}
    >
      {field(fromId, 'From', from, setFrom)}
      {field(toId, 'To', to, setTo)}
      <Button type="button" onClick={apply} className={cn('h-11', isStacked && 'w-full')}>
        Apply dates
      </Button>
      {error && (
        <p id={errorId} role="alert" className="basis-full text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
