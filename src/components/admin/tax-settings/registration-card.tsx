'use client'

import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Landmark } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { tinHeaderLine, type VatStatus } from '@/lib/gov-discount'
import { profileFromFormValues } from '@/lib/tax-settings/form-mapping'
import { TAX_TEXT_LIMITS, type TaxSettingsFormValues } from '@/lib/tax-settings/form-schema'
import { formatBranchCodeInput, formatTinInput } from '@/lib/tax-settings/tin'
import { formatPeso, seniorMealExample } from '@/lib/tax-settings/vat-example'
import { ChoiceCards, type ChoiceOption } from './choice-cards'
import { Field, TaxCard, describedById } from './form-bits'
import { PaperLine, ReceiptPaper } from './receipt-paper'

function exampleLine(vatStatus: VatStatus): string {
  const example = seniorMealExample(vatStatus)
  if (!example) return ''
  return `${formatPeso(example.price)} meal → a senior or PWD pays ${formatPeso(example.pays)}`
}

const VAT_OPTIONS: readonly ChoiceOption<VatStatus>[] = [
  {
    value: 'vat',
    title: 'VAT-registered',
    hint: 'You add 12% VAT to your sales. For Senior/PWD, VAT comes off first, then 20%.',
    detail: <ExampleChip text={exampleLine('vat')} />,
  },
  {
    value: 'non_vat',
    title: 'Non-VAT',
    hint: 'You pay percentage tax, not VAT. For Senior/PWD, 20% comes straight off the price.',
    detail: <ExampleChip text={exampleLine('non_vat')} />,
  },
]

function ExampleChip({ text }: { text: string }) {
  if (!text) return null
  return (
    <span className="mt-1.5 inline-flex w-fit rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums text-foreground">
      {text}
    </span>
  )
}

function HeaderPreview() {
  const values = useWatch<TaxSettingsFormValues>()
  const vatStatus = values.vatStatus
  const profile = vatStatus
    ? profileFromFormValues({ ...(values as TaxSettingsFormValues), vatStatus })
    : null
  const tinLine = profile ? tinHeaderLine(profile) : null

  return (
    <ReceiptPaper label="How the top of your receipt will look">
      <PaperLine isBold isPlaceholder={!profile?.registeredName}>
        {profile?.registeredName ?? 'YOUR REGISTERED BUSINESS NAME'}
      </PaperLine>
      <PaperLine isPlaceholder={!profile?.businessAddress}>
        {profile?.businessAddress ?? 'Registered address'}
      </PaperLine>
      <PaperLine isPlaceholder={!tinLine}>
        {tinLine ?? (vatStatus ? 'Add your TIN to print it here' : 'Choose VAT or Non-VAT above')}
      </PaperLine>
    </ReceiptPaper>
  )
}

export function RegistrationCard() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<TaxSettingsFormValues>()

  return (
    <TaxCard
      id="tax-registration"
      icon={Landmark}
      title="Your BIR registration"
      description="Copy these from your BIR Certificate of Registration (Form 2303). Not sure if you're VAT-registered? It says so on that certificate."
    >
      <div className="space-y-2">
        <p id="vat-status-label" className="text-sm font-medium">
          Is your store VAT-registered?
        </p>
        <Controller
          control={control}
          name="vatStatus"
          render={({ field }) => (
            <ChoiceCards
              name={field.name}
              labelledBy="vat-status-label"
              options={VAT_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              isInvalid={Boolean(errors.vatStatus)}
              describedBy={errors.vatStatus ? 'vat-status-error' : undefined}
            />
          )}
        />
        {errors.vatStatus && (
          <p id="vat-status-error" role="alert" className="text-sm text-destructive">
            {errors.vatStatus.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="registeredName"
          label="Registered business name"
          hint="Exactly as it appears on your certificate."
          error={errors.registeredName?.message}
          optional
          className="sm:col-span-2"
        >
          <Input
            id="registeredName"
            autoComplete="organization"
            maxLength={TAX_TEXT_LIMITS.registeredName}
            aria-invalid={Boolean(errors.registeredName)}
            aria-describedby={describedById('registeredName', errors.registeredName?.message)}
            {...register('registeredName')}
          />
        </Field>

        <Field
          id="tin"
          label="TIN"
          hint="9 digits. You can include the branch code at the end."
          error={errors.tin?.message}
          optional
        >
          <Controller
            control={control}
            name="tin"
            render={({ field }) => (
              <Input
                id="tin"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000-000-000-00000"
                className="font-mono tabular-nums"
                aria-invalid={Boolean(errors.tin)}
                aria-describedby={describedById('tin', errors.tin?.message)}
                name={field.name}
                ref={field.ref}
                value={field.value}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(formatTinInput(event.target.value))}
              />
            )}
          />
        </Field>

        <Field
          id="tinBranchCode"
          label="Branch code"
          hint="Head office is usually 000 or 00000."
          error={errors.tinBranchCode?.message}
          optional
        >
          <Controller
            control={control}
            name="tinBranchCode"
            render={({ field }) => (
              <Input
                id="tinBranchCode"
                inputMode="numeric"
                autoComplete="off"
                placeholder="00000"
                className="font-mono tabular-nums"
                aria-invalid={Boolean(errors.tinBranchCode)}
                aria-describedby={describedById('tinBranchCode', errors.tinBranchCode?.message)}
                name={field.name}
                ref={field.ref}
                value={field.value}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(formatBranchCodeInput(event.target.value))}
              />
            )}
          />
        </Field>

        <Field
          id="businessAddress"
          label="Registered address"
          error={errors.businessAddress?.message}
          optional
          className="sm:col-span-2"
        >
          <Textarea
            id="businessAddress"
            rows={2}
            maxLength={TAX_TEXT_LIMITS.businessAddress}
            aria-invalid={Boolean(errors.businessAddress)}
            {...register('businessAddress')}
          />
        </Field>
      </div>

      <HeaderPreview />
    </TaxCard>
  )
}
