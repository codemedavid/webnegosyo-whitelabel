'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { BadgePercent, Lock, TriangleAlert, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { GOV_DISCOUNT_KINDS, GOV_DISCOUNT_RULES, isMandatoryKind, type GovDiscountKind } from '@/lib/gov-discount'
import { OPTIONAL_GOV_KINDS, toggleKind } from '@/lib/tax-settings/form-mapping'
import type { TaxSettingsFormValues } from '@/lib/tax-settings/form-schema'
import { Note, TaxCard } from './form-bits'

const MANDATORY_KINDS = GOV_DISCOUNT_KINDS.filter(isMandatoryKind)

function LockedKindRow({ kind }: { kind: GovDiscountKind }) {
  const rule = GOV_DISCOUNT_RULES[kind]
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {rule.label} <span className="font-normal text-muted-foreground">· {rule.ratePercent}% off</span>
        </p>
        <p className="text-xs text-muted-foreground">{rule.law}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Lock className="h-3 w-3" aria-hidden />
        Always on
      </Badge>
    </li>
  )
}

interface OptionalKindRowProps {
  kind: GovDiscountKind
  isOn: boolean
  onChange: (isOn: boolean) => void
}

function OptionalKindRow({ kind, isOn, onChange }: OptionalKindRowProps) {
  const rule = GOV_DISCOUNT_RULES[kind]
  const switchId = `kind-${kind}`
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={switchId} className="text-sm font-semibold">
            {rule.label}
          </Label>
          <p className="text-xs text-muted-foreground">
            {rule.ratePercent}% off · {rule.law}
          </p>
        </div>
        <Switch id={switchId} checked={isOn} onCheckedChange={onChange} />
      </div>
      {rule.caution && (
        <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {rule.caution}
        </p>
      )}
    </li>
  )
}

export function DiscountsOfferedCard() {
  const { control } = useFormContext<TaxSettingsFormValues>()

  return (
    <TaxCard
      id="tax-discounts"
      icon={BadgePercent}
      title="Discounts you offer"
      description="These show as buttons on the register and at checkout."
    >
      <div className="space-y-2">
        <ul className="divide-y rounded-lg border">
          {MANDATORY_KINDS.map((kind) => (
            <LockedKindRow key={kind} kind={kind} />
          ))}
        </ul>
        <Note icon={Lock}>
          <p>
            The law requires these, so they can’t be switched off. Refusing a Senior Citizen or PWD
            discount is a crime under RA 9994 and RA 10754.
          </p>
        </Note>
      </div>

      <Controller
        control={control}
        name="enabledKinds"
        render={({ field }) => (
          <div className="space-y-2">
            <p className="text-sm font-medium">Optional</p>
            <ul className="divide-y rounded-lg border">
              {OPTIONAL_GOV_KINDS.map((kind) => (
                <OptionalKindRow
                  key={kind}
                  kind={kind}
                  isOn={field.value.includes(kind)}
                  onChange={(isOn) => field.onChange(toggleKind(field.value, kind, isOn))}
                />
              ))}
            </ul>
          </div>
        )}
      />

      <Controller
        control={control}
        name="allowSharedTable"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="flex min-w-0 gap-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <Label htmlFor="allowSharedTable" className="font-medium">
                  Allow splitting a shared table (pro-rata)
                </Label>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  When food is shared, a senior or PWD gets 20% off their equal share: the shared food
                  divided by everyone at the table. Turn off to discount only what they ordered for
                  themselves.
                </p>
              </div>
            </div>
            <Switch id="allowSharedTable" ref={field.ref} checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
    </TaxCard>
  )
}
