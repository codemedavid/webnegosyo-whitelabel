'use client'

/**
 * Settings → Tax & discounts. One form over five cards, one save bar.
 *
 * Read-only viewers (staff who may open Settings but are not the owner) get
 * the same cards inside a disabled fieldset — the database refuses their
 * writes anyway, and seeing the rules is useful to whoever runs the register.
 */

import { useState } from 'react'
import { FormProvider, useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { saveTaxSettingsAction } from '@/app/actions/tax-settings'
import { describeActionError } from '@/components/admin/server-action-safety'
import type { TaxSettingsFormDefaults } from '@/lib/tax-settings/form-mapping'
import {
  taxSettingsFormSchema,
  type TaxSettingsField,
  type TaxSettingsFormValues,
} from '@/lib/tax-settings/form-schema'
import { ApprovalRuleCard } from './approval-rule-card'
import { DiscountsOfferedCard } from './discounts-offered-card'
import { ReceiptsCard } from './receipts-card'
import { RegistrationCard } from './registration-card'
import { ServiceChargeCard } from './service-charge-card'
import { IdPhotosCard } from './id-photos-card'
import { TaxSaveBar } from './tax-save-bar'

const FORM_ID = 'tax-settings-form'

interface TaxSettingsFormProps {
  tenantId: string
  tenantSlug: string
  defaults: TaxSettingsFormDefaults
  hasProfile: boolean
  canEdit: boolean
}

export function TaxSettingsForm({ tenantId, tenantSlug, defaults, hasProfile, canEdit }: TaxSettingsFormProps) {
  const [isSetUp, setIsSetUp] = useState(hasProfile)
  const form = useForm<TaxSettingsFormValues, unknown, TaxSettingsFormValues>({
    resolver: zodResolver(taxSettingsFormSchema),
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const {
    handleSubmit,
    reset,
    setError,
    formState: { isDirty, isSubmitting },
  } = form

  const save = async (values: TaxSettingsFormValues) => {
    try {
      const result = await saveTaxSettingsAction(tenantId, tenantSlug, values)
      if (!result.success) {
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(field as TaxSettingsField, { type: 'server', message })
        }
        toast.error(result.error)
        return
      }
      reset(values)
      setIsSetUp(true)
      toast.success('Tax & discount settings saved')
    } catch (error) {
      toast.error(describeActionError(error))
    }
  }

  const showProblems = (errors: FieldErrors<TaxSettingsFormValues>) => {
    const count = Object.keys(errors).length
    toast.error(count === 1 ? 'Please fix the highlighted field.' : 'Please fix the highlighted fields.')
  }

  return (
    <FormProvider {...form}>
      <form id={FORM_ID} onSubmit={handleSubmit(save, showProblems)} noValidate className="space-y-6">
        <fieldset disabled={!canEdit || isSubmitting} className="min-w-0 space-y-6">
          <legend className="sr-only">Tax and discount settings</legend>
          <RegistrationCard />
          <ReceiptsCard />
          <DiscountsOfferedCard />
          <ApprovalRuleCard />
          <ServiceChargeCard />
          <IdPhotosCard />
        </fieldset>
      </form>

      {canEdit && (
        <TaxSaveBar
          formId={FORM_ID}
          isDirty={isDirty}
          isSaving={isSubmitting}
          isFirstSave={!isSetUp}
          onDiscard={() => reset()}
        />
      )}
    </FormProvider>
  )
}
