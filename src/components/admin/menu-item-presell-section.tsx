'use client'

/**
 * The menu item form's pre-order block: the switch that makes a dish sell
 * per date, and the allocation panel beneath it.
 *
 * The switch and the dates are both part of the form's draft — they land
 * together when "Update Menu Item" is pressed. Neither writes on its own any
 * more: a Server Action that revalidates anything re-renders the route the
 * merchant is standing on, so a write per toggle and a write per date meant
 * the editor refreshed under them as they worked.
 *
 * `SettingSwitch` is the row vocabulary the form's other toggles share.
 */

import dynamic from 'next/dynamic'
import { CalendarDays } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { DraftAllocation } from '@/lib/presell/allocation-draft'

/**
 * Loaded only once a merchant actually turns pre-ordering on.
 *
 * The panel drags in a month grid, the allocation list and the range helper,
 * and it is off for almost every dish on the menu — shipping it in the
 * editor's first chunk made every dish pay for a feature most never use.
 */
const PresellStockPanel = dynamic(
  () => import('@/components/admin/presell-stock-panel').then((m) => m.PresellStockPanel),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3" aria-busy="true" aria-label="Loading pre-order dates">
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    ),
  },
)

interface SettingSwitchProps {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function SettingSwitch({ id, label, description, checked, onCheckedChange }: SettingSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

interface MenuItemPresellSectionProps {
  isEnabled: boolean
  onToggle: (checked: boolean) => void
  /** The dates as the dish was last saved. */
  savedAllocations: readonly DraftAllocation[]
  /** The dates as the merchant has them now. */
  draft: readonly DraftAllocation[]
  onDraftChange: (next: DraftAllocation[]) => void
  /**
   * Set when the page could not read the dish's existing dates. The panel is
   * withheld rather than shown empty: "no dates offered" and "we could not
   * find out" look identical, and saving over the second would drop dates
   * that are still on sale.
   */
  loadError?: string
}

export function MenuItemPresellSection({
  isEnabled,
  onToggle,
  savedAllocations,
  draft,
  onDraftChange,
  loadError,
}: MenuItemPresellSectionProps) {
  return (
    <section className="rounded-xl border" aria-labelledby="presell-heading">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600/10 text-sky-700 dark:text-sky-300">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label id="presell-heading" htmlFor="presell_enabled" className="text-sm font-semibold">
              Pre-order with limited stock per date
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Customers pick a pickup date when they order. Each date sells only what you allocate below.
            </p>
          </div>
        </div>
        <Switch id="presell_enabled" checked={isEnabled} onCheckedChange={onToggle} />
      </div>
      {isEnabled && (
        <div className="border-t bg-muted/20 p-4">
          {loadError ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {loadError} Reload the page before changing dates — saving now could drop dates that are still on sale.
            </p>
          ) : (
            <PresellStockPanel
              savedAllocations={savedAllocations}
              draft={draft}
              onDraftChange={onDraftChange}
            />
          )}
        </div>
      )}
    </section>
  )
}
