'use client'

import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { HandCoins, MessageCircleQuestion } from 'lucide-react'
import type { ServiceChargeMode } from '@/lib/gov-discount'
import type { TaxSettingsFormValues } from '@/lib/tax-settings/form-schema'
import { ChoiceCards, type ChoiceOption } from './choice-cards'
import { Note, TaxCard } from './form-bits'

const MODE_OPTIONS: readonly ChoiceOption<ServiceChargeMode>[] = [
  {
    value: 'full',
    title: 'Charge in full (recommended)',
    hint: 'The service charge is worked out on the bill before any discount.',
  },
  {
    value: 'exempt_share',
    title: 'Remove VAT from their share',
    hint: 'The senior’s or PWD’s share of the service charge is VAT-free, like their food.',
  },
]

export function ServiceChargeCard() {
  const { control } = useFormContext<TaxSettingsFormValues>()
  const vatStatus = useWatch<TaxSettingsFormValues, 'vatStatus'>({ name: 'vatStatus' })

  return (
    <TaxCard
      id="tax-service-charge"
      icon={HandCoins}
      title="Service charge"
      description="Only matters if you add a service charge to bills."
    >
      <p id="service-charge-label" className="sr-only">
        How a Senior/PWD share of the service charge is handled
      </p>
      <Controller
        control={control}
        name="serviceChargeMode"
        render={({ field }) => (
          <ChoiceCards
            name={field.name}
            labelledBy="service-charge-label"
            options={MODE_OPTIONS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {vatStatus === 'non_vat' && (
        <p className="text-sm text-muted-foreground">
          You’re Non-VAT, so there’s no VAT to remove — the service charge is charged in full either way.
        </p>
      )}
      <Note icon={MessageCircleQuestion}>
        <p>Not sure which one your store follows? Confirm with your accountant before changing it.</p>
      </Note>
    </TaxCard>
  )
}
