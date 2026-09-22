'use client'

import type { LucideIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * The two shapes every order-type setting takes.
 *
 * The configure screen was one 1,000-line component that hand-rolled the same
 * "label / helper text / switch" flex row a dozen times, each with slightly
 * different spacing, so nothing lined up and no two helper lines read the same.
 * These two pieces are the whole vocabulary of the screen now.
 */

interface SettingsSectionProps {
  /** Anchor target for the "Jump to" list. */
  id: string
  title: string
  description?: string
  icon: LucideIcon
  children: React.ReactNode
}

export function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  children,
}: SettingsSectionProps) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border bg-card shadow-sm">
      <header className="flex items-start gap-3 border-b px-4 py-4 sm:px-5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-5 px-4 py-5 sm:px-5">{children}</div>
    </section>
  )
}

interface ToggleRowProps {
  id: string
  label: string
  /** One line saying what the CURRENT state means — not what the switch does. */
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon?: LucideIcon
  disabled?: boolean
  /** Nested settings revealed while the switch is on. */
  children?: React.ReactNode
}

/**
 * A switch with its explanation.
 *
 * The hint always describes the state the merchant is looking at ("Visible to
 * customers" / "Hidden from customers"), never the action — a merchant reading
 * "Enable order type" next to an on switch cannot tell which way it is set.
 */
export function ToggleRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
  icon: Icon,
  disabled = false,
  children,
}: ToggleRowProps) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        checked ? 'border-primary/30 bg-primary/[0.03]' : 'bg-background'
      )}
    >
      {/*
        The switch is a SIBLING of the label, never a child: a `htmlFor` label
        forwards its click to the control, so a switch nested inside one toggles
        twice per tap and appears not to move at all.
      */}
      <div className="flex items-center justify-between gap-4 p-3 sm:p-4">
        <Label htmlFor={id} className="min-w-0 cursor-pointer flex-col items-start gap-0.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            {label}
          </span>
          <span className="text-sm font-normal leading-snug text-muted-foreground">{hint}</span>
        </Label>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="shrink-0"
        />
      </div>
      {checked && children && (
        <div className="space-y-4 border-t px-3 pb-4 pt-4 sm:px-4">{children}</div>
      )}
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  /** Shown under the control. Keep it to what the merchant needs to decide. */
  hint?: string
  optional?: boolean
  children: React.ReactNode
}

/** A labelled input with its helper line. */
export function Field({ id, label, hint, optional = false, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {optional && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}
