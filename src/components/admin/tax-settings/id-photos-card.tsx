'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { Camera, LockKeyhole } from 'lucide-react'
import { ID_PHOTO_PRIVACY_NOTE, type IdPhotoMode } from '@/lib/gov-discount'
import type { TaxSettingsFormValues } from '@/lib/tax-settings/form-schema'
import { ChoiceCards, type ChoiceOption } from './choice-cards'
import { Note, TaxCard } from './form-bits'

const PHOTO_OPTIONS: readonly ChoiceOption<IdPhotoMode>[] = [
  { value: 'off', title: 'Off (recommended)', hint: 'The cashier types the ID number only.' },
  {
    value: 'optional',
    title: 'Optional',
    hint: 'The cashier may take a photo of the ID, or skip it. A sale never waits on it.',
  },
]

/** Whether the register may photograph the claimant's ID. Off by default; never required. */
export function IdPhotosCard() {
  const { control } = useFormContext<TaxSettingsFormValues>()

  return (
    <TaxCard
      id="tax-id-photos"
      icon={Camera}
      title="ID photos"
      description="Let the cashier take a photo of the Senior/PWD ID when giving the discount. The name and ID number are always recorded."
    >
      <p id="id-photo-label" className="sr-only">
        Photos of Senior/PWD IDs
      </p>
      <Controller
        control={control}
        name="idPhotoMode"
        render={({ field }) => (
          <ChoiceCards
            name={field.name}
            labelledBy="id-photo-label"
            options={PHOTO_OPTIONS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Note icon={LockKeyhole}>
        <p>{ID_PHOTO_PRIVACY_NOTE}</p>
      </Note>
    </TaxCard>
  )
}
