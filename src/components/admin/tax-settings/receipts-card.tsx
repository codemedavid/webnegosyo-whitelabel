'use client'

import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Info, ReceiptText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NOT_AN_INVOICE_NOTICE } from '@/lib/gov-discount'
import { TAX_TEXT_LIMITS, type TaxSettingsFormValues } from '@/lib/tax-settings/form-schema'
import { Field, Note, TaxCard, describedById } from './form-bits'
import { PaperLine, ReceiptPaper } from './receipt-paper'

type PosField = 'posMin' | 'posSerialNo' | 'posPtuNo'

const POS_FIELDS: readonly { name: PosField; label: string; hint: string; max: number; optional?: boolean }[] = [
  { name: 'posMin', label: 'MIN', hint: 'Machine Identification Number', max: TAX_TEXT_LIMITS.posMin },
  {
    name: 'posSerialNo',
    label: 'Serial no.',
    hint: 'Printed on your PTU',
    max: TAX_TEXT_LIMITS.posSerialNo,
    optional: true,
  },
  { name: 'posPtuNo', label: 'PTU no.', hint: 'Permit To Use number', max: TAX_TEXT_LIMITS.posPtuNo },
]

function PosDetails() {
  const {
    register,
    formState: { errors },
  } = useFormContext<TaxSettingsFormValues>()

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {POS_FIELDS.map((field) => {
        const error = errors[field.name]?.message
        return (
          <Field key={field.name} id={field.name} label={field.label} hint={field.hint} error={error} optional={field.optional}>
            <Input
              id={field.name}
              autoComplete="off"
              maxLength={field.max}
              className="font-mono"
              aria-invalid={Boolean(error)}
              aria-describedby={describedById(field.name, error)}
              {...register(field.name)}
            />
          </Field>
        )
      })}
    </div>
  )
}

function SupplementaryNotice() {
  return (
    <div className="space-y-3">
      <ReceiptPaper label="Your receipts will end with">
        <PaperLine isBold>{NOT_AN_INVOICE_NOTICE}</PaperLine>
      </ReceiptPaper>
      <Note icon={Info}>
        <p>
          <span className="font-medium text-foreground">Why:</span> under BIR RR 7-2024, a receipt from a
          system without a Permit To Use is not an official invoice and has to say so. Senior and PWD
          discounts are still worked out and recorded in full.
        </p>
      </Note>
    </div>
  )
}

export function ReceiptsCard() {
  const { control } = useFormContext<TaxSettingsFormValues>()
  const isBirRegisteredPos = useWatch<TaxSettingsFormValues, 'isBirRegisteredPos'>({ name: 'isBirRegisteredPos' })

  return (
    <TaxCard
      id="tax-receipts"
      icon={ReceiptText}
      title="Receipts"
      description="Only a point-of-sale system the BIR has accredited can print official invoices."
    >
      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="min-w-0">
          <Label htmlFor="isBirRegisteredPos" className="font-medium">
            My POS is BIR-registered (has a Permit To Use)
          </Label>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Leave this off unless the BIR issued a PTU for this register.
          </p>
        </div>
        <Controller
          control={control}
          name="isBirRegisteredPos"
          render={({ field }) => (
            <Switch
              id="isBirRegisteredPos"
              ref={field.ref}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      {isBirRegisteredPos ? <PosDetails /> : <SupplementaryNotice />}
    </TaxCard>
  )
}
