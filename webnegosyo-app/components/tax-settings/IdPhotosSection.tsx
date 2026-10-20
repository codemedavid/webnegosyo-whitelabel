import React from "react";
import type { IdPhotoMode } from "../../lib/gov-discount";
import { ID_PHOTO_PRIVACY_NOTE } from "../../lib/tax-settings/id-photos";
import { ChoiceCards, Note, SettingsCard, type ChoiceOption } from "./parts";
import type { TaxSectionProps } from "./RegistrationSection";

const PHOTO_OPTIONS: readonly ChoiceOption<IdPhotoMode>[] = [
  { value: "off", title: "Off (recommended)", hint: "The cashier types the ID number only." },
  { value: "optional", title: "Optional", hint: "The cashier may take a photo of the ID, or skip it. A sale never waits on it." },
];

/** Whether the register may photograph the claimant's ID. Off by default; never required. */
export function IdPhotosSection({ form, onChange, disabled }: TaxSectionProps) {
  return (
    <SettingsCard
      title="ID photos"
      description="Let the cashier take a photo of the Senior/PWD ID when giving the discount. The name and ID number are always recorded."
    >
      <ChoiceCards
        label="Photos of Senior/PWD IDs"
        options={PHOTO_OPTIONS}
        value={form.idPhotoMode}
        onChange={(idPhotoMode) => onChange({ idPhotoMode })}
        disabled={disabled}
      />
      <Note icon="photo">{ID_PHOTO_PRIVACY_NOTE}</Note>
    </SettingsCard>
  );
}
