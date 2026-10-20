'use client'

import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { ShieldCheck, BookCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { ApprovalRule } from '@/lib/gov-discount'
import type { TaxSettingsFormValues } from '@/lib/tax-settings/form-schema'
import { ChoiceCards, type ChoiceOption } from './choice-cards'
import { Field, Note, TaxCard, describedById } from './form-bits'

const RULE_OPTIONS: readonly ChoiceOption<ApprovalRule>[] = [
  { value: 'never', title: 'Never', hint: 'Cashiers apply discounts on their own.' },
  { value: 'above', title: 'Above an amount', hint: 'A manager’s PIN for big discounts only.' },
  { value: 'always', title: 'Always', hint: 'A manager’s PIN for every discount.' },
]

function ThresholdField() {
  const {
    register,
    formState: { errors },
  } = useFormContext<TaxSettingsFormValues>()
  const error = errors.approvalThreshold?.message

  return (
    <Field
      id="approvalThreshold"
      label="Ask for a PIN when a discount takes off more than"
      hint="Counts everything taken off the bill: the 20% plus any VAT removed."
      error={error}
      className="max-w-sm"
    >
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          ₱
        </span>
        <Input
          id="approvalThreshold"
          inputMode="decimal"
          autoComplete="off"
          className="pl-7 tabular-nums"
          aria-invalid={Boolean(error)}
          aria-describedby={describedById('approvalThreshold', error)}
          {...register('approvalThreshold')}
        />
      </div>
    </Field>
  )
}

export function ApprovalRuleCard() {
  const { control } = useFormContext<TaxSettingsFormValues>()
  const approvalRule = useWatch<TaxSettingsFormValues, 'approvalRule'>({ name: 'approvalRule' })

  return (
    <TaxCard
      id="tax-approval"
      icon={ShieldCheck}
      title="Manager approval"
      description="Choose when a manager has to type their PIN on the register before a Senior/PWD discount goes through."
    >
      <div className="space-y-2">
        <p id="approval-rule-label" className="sr-only">
          When to ask for a manager’s PIN
        </p>
        <Controller
          control={control}
          name="approvalRule"
          render={({ field }) => (
            <ChoiceCards
              name={field.name}
              labelledBy="approval-rule-label"
              options={RULE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              columns={3}
            />
          )}
        />
      </div>

      {approvalRule === 'above' && <ThresholdField />}

      <Note icon={BookCheck}>
        <p>
          Every discount is recorded in your Senior/PWD sales book either way. A PIN only shows a
          manager checked it — the customer still gets their discount, and refusing it is never an option.
        </p>
        <p>If the register is offline, the sale still goes through and is flagged for you to review.</p>
      </Note>
    </TaxCard>
  )
}
