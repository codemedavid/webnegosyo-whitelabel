'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  BranchSelect,
  CompareSwitch,
  CustomRangeFields,
  LockedBranchChip,
  TARGET_44,
  type FilterOption,
} from './filter-controls'

/** The preset whose dates come from `from`/`to`. */
export const CUSTOM_PRESET = 'custom'
/** Matches Tailwind's `sm` breakpoint, where the bar stops collapsing. */
const WIDE_QUERY = '(min-width: 640px)'

export interface ReportFilterValue {
  preset: string
  from: string | null
  to: string | null
  branch: string | null
  compare: boolean
}

export interface ReportFilterBarProps {
  presets: FilterOption[]
  value: ReportFilterValue
  /** null/undefined = no branch chip (single-branch store). Include an Unassigned option if wanted. */
  branches?: FilterOption[] | null
  /** Branch accounts: a locked chip instead of a picker. */
  isBranchLocked?: boolean
  lockedBranchLabel?: string
  /** All filter state lives in the URL: this turns the next state into an href. */
  buildHref: (next: ReportFilterValue) => string
  /** Longest custom range, inclusive. */
  maxDays: number
  /** Store-local today, YYYY-MM-DD. */
  today: string
  /** The page's default Compare state; only a change from it counts in "Filters · N". */
  defaultCompare?: boolean
  className?: string
}

const RANGE_DATE = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function rangeLabel(from: string, to: string): string {
  const format = (day: string) => RANGE_DATE.format(new Date(`${day}T00:00:00Z`))
  return from === to ? format(from) : `${format(from)} – ${format(to)}`
}

function isWideScreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(WIDE_QUERY).matches
}

interface PeriodSelectProps {
  presets: FilterOption[]
  value: string
  text: string
  onChange: (preset: string) => void
}

function PeriodSelect({ presets, value, text, onChange }: PeriodSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Period" className={cn(TARGET_44, 'min-w-36 bg-white font-semibold')}>
        <SelectValue>{text}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {presets.map((preset) => (
          <SelectItem key={preset.value} value={preset.value}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface FiltersSheetProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  children: ReactNode
}

/** Below 640px the filters live here (Radix Dialog: focus trapped, restored on close). */
function FiltersSheet({ isOpen, onOpenChange, children }: FiltersSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl data-[state=closed]:duration-200 data-[state=open]:duration-200 motion-reduce:animate-none"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Changes apply as you make them.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-2">{children}</div>
        <div className="px-4 pb-4">
          <SheetClose asChild>
            <Button type="button" variant="outline" className="h-11 w-full">
              Done
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}

type ControlsLayout = 'inline' | 'stacked'

interface FilterControlsProps {
  layout: ControlsLayout
  value: ReportFilterValue
  isCustomShown: boolean
  today: string
  maxDays: number
  onApplyRange: (range: { from: string; to: string }) => void
  /** The branches to pick from, or null when there is no picker. */
  branchPicker: FilterOption[] | null | undefined
  isBranchLocked: boolean
  lockedBranchLabel?: string
  onBranch: (branch: string | null) => void
  onCompare: (compare: boolean) => void
}

/** Custom dates, branch and Compare: one row on desktop, stacked in the sheet. */
function FilterControls({
  layout,
  value,
  isCustomShown,
  today,
  maxDays,
  onApplyRange,
  branchPicker,
  isBranchLocked,
  lockedBranchLabel,
  onBranch,
  onCompare,
}: FilterControlsProps) {
  return (
    <>
      {isCustomShown && (
        <CustomRangeFields
          key={`${value.from ?? ''}:${value.to ?? ''}`}
          layout={layout}
          initialFrom={value.from}
          initialTo={value.to}
          today={today}
          maxDays={maxDays}
          onApply={onApplyRange}
        />
      )}
      {isBranchLocked && <LockedBranchChip label={lockedBranchLabel} />}
      {!isBranchLocked && branchPicker && (
        <BranchSelect
          branches={branchPicker}
          value={value.branch}
          onChange={onBranch}
          hasVisibleLabel={layout === 'stacked'}
        />
      )}
      <CompareSwitch isOn={value.compare} onChange={onCompare} />
    </>
  )
}

function presetLabel(value: ReportFilterValue, presets: FilterOption[], shown: string, isCustomPicked: boolean): string {
  if (value.preset === CUSTOM_PRESET && value.from && value.to && !isCustomPicked) {
    return rangeLabel(value.from, value.to)
  }
  return presets.find((preset) => preset.value === shown)?.label ?? 'Period'
}

/**
 * The shared report filter bar (plan §3.3). Desktop: period, custom dates,
 * branch, Compare in one row. Below 640px: `[This week ▾] [Filters · N]`, the
 * rest in a bottom sheet.
 */
export function ReportFilterBar({
  presets,
  value,
  branches,
  isBranchLocked = false,
  lockedBranchLabel,
  buildHref,
  maxDays,
  today,
  defaultCompare = true,
  className,
}: ReportFilterBarProps) {
  const router = useRouter()
  const [isCustomPicked, setIsCustomPicked] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const go = (next: ReportFilterValue) => router.push(buildHref(next), { scroll: false })
  const isCustomShown = value.preset === CUSTOM_PRESET || isCustomPicked
  const hasBranchPicker = !isBranchLocked && Array.isArray(branches) && branches.length > 0
  const activeCount = (hasBranchPicker && value.branch ? 1 : 0) + (value.compare !== defaultCompare ? 1 : 0)

  const choosePreset = (preset: string) => {
    if (preset === CUSTOM_PRESET) {
      setIsCustomPicked(true)
      if (!isWideScreen()) setIsSheetOpen(true)
      return
    }
    setIsCustomPicked(false)
    go({ ...value, preset, from: null, to: null })
  }
  const applyRange = ({ from, to }: { from: string; to: string }) => {
    setIsCustomPicked(false)
    setIsSheetOpen(false)
    go({ ...value, preset: CUSTOM_PRESET, from, to })
  }

  const presetValue = isCustomShown ? CUSTOM_PRESET : value.preset
  const controls = (layout: ControlsLayout) => (
    <FilterControls
      layout={layout}
      value={value}
      isCustomShown={isCustomShown}
      today={today}
      maxDays={maxDays}
      onApplyRange={applyRange}
      branchPicker={hasBranchPicker ? branches : null}
      isBranchLocked={isBranchLocked}
      lockedBranchLabel={lockedBranchLabel}
      onBranch={(branch) => go({ ...value, branch })}
      onCompare={(compare) => go({ ...value, compare })}
    />
  )

  return (
    <div role="group" aria-label="Report filters" className={cn('flex flex-wrap items-center gap-2', className)}>
      <PeriodSelect
        presets={presets}
        value={presetValue}
        text={presetLabel(value, presets, presetValue, isCustomPicked)}
        onChange={choosePreset}
      />
      <div data-testid="report-filters-inline" className="hidden flex-wrap items-center gap-2 sm:flex">
        {controls('inline')}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsSheetOpen(true)}
        className="h-11 bg-white font-semibold sm:hidden"
      >
        <SlidersHorizontal aria-hidden />
        {activeCount > 0 ? `Filters · ${activeCount}` : 'Filters'}
      </Button>
      <FiltersSheet isOpen={isSheetOpen} onOpenChange={setIsSheetOpen}>
        {controls('stacked')}
      </FiltersSheet>
    </div>
  )
}
