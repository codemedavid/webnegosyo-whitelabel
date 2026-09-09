'use client'

/**
 * The menu item form's pre-order block: the switch that makes a dish sell
 * per date, and the allocation panel beneath it once the dish exists.
 * `SettingSwitch` is the row vocabulary the form's other toggles share.
 */

import { CalendarDays } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PresellStockPanel } from '@/components/admin/presell-stock-panel'

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
  tenantId: string
  tenantSlug: string
  /** Null until the dish is saved; allocations need an id to attach to. */
  menuItemId: string | null
}

export function MenuItemPresellSection({ isEnabled, onToggle, tenantId, tenantSlug, menuItemId }: MenuItemPresellSectionProps) {
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
          {menuItemId ? (
            <PresellStockPanel tenantId={tenantId} tenantSlug={tenantSlug} menuItemId={menuItemId} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Save the dish first. You will be able to set stock per date as soon as it exists.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
