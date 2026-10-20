import React from "react";
import { tinHeaderLine, type VatStatus } from "../../lib/gov-discount";
import { profileFromForm, TAX_TEXT_LIMITS, type TaxSettingsErrors, type TaxSettingsForm } from "../../lib/tax-settings/form";
import { formatBranchCodeInput, formatTinInput, TIN_MAX_LENGTH } from "../../lib/tax-settings/tin";
import { exampleLine } from "../../lib/tax-settings/vat-example";
import { ChoiceCards, PaperPreview, SettingsCard, TextField, type ChoiceOption } from "./parts";

export interface TaxSectionProps {
  form: TaxSettingsForm;
  errors: TaxSettingsErrors;
  onChange: (patch: Partial<TaxSettingsForm>) => void;
  disabled: boolean;
}

const VAT_OPTIONS: readonly ChoiceOption<VatStatus>[] = [
  {
    value: "vat",
    title: "VAT-registered",
    hint: "You add 12% VAT to your sales. For Senior/PWD, VAT comes off first, then 20%.",
    detail: exampleLine("vat"),
  },
  {
    value: "non_vat",
    title: "Non-VAT",
    hint: "You pay percentage tax, not VAT. For Senior/PWD, 20% comes straight off the price.",
    detail: exampleLine("non_vat"),
  },
];

const BRANCH_CODE_MAX_LENGTH = 5;

function HeaderPreview({ form }: { form: TaxSettingsForm }) {
  const profile = profileFromForm(form);
  const tinLine = profile ? tinHeaderLine(profile) : null;
  return (
    <PaperPreview
      label="How the top of your receipt will look"
      lines={[
        {
          text: profile?.registeredName ?? "YOUR REGISTERED BUSINESS NAME",
          isBold: true,
          isPlaceholder: !profile?.registeredName,
        },
        { text: profile?.businessAddress ?? "Registered address", isPlaceholder: !profile?.businessAddress },
        {
          text: tinLine ?? (form.vatStatus ? "Add your TIN to print it here" : "Choose VAT or Non-VAT above"),
          isPlaceholder: !tinLine,
        },
      ]}
    />
  );
}

/** VAT status (the big choice), then the BIR certificate details. */
export function RegistrationSection({ form, errors, onChange, disabled }: TaxSectionProps) {
  return (
    <SettingsCard
      title="Your BIR registration"
      description="Copy these from your BIR Certificate of Registration (Form 2303). Not sure if you're VAT-registered? It says so on that certificate."
    >
      <ChoiceCards
        label="Is your store VAT-registered?"
        options={VAT_OPTIONS}
        value={form.vatStatus}
        onChange={(vatStatus) => onChange({ vatStatus })}
        disabled={disabled}
        isInvalid={!!errors.vatStatus}
      />
      <TextField
        label="Registered business name"
        hint="Exactly as it appears on your certificate."
        isOptional
        value={form.registeredName}
        onChangeText={(registeredName) => onChange({ registeredName })}
        maxLength={TAX_TEXT_LIMITS.registeredName}
        autoComplete="organization"
        error={errors.registeredName}
        disabled={disabled}
      />
      <TextField
        label="TIN"
        hint="9 digits. You can include the branch code at the end."
        isOptional
        isMono
        value={form.tin}
        onChangeText={(raw) => onChange({ tin: formatTinInput(raw) })}
        placeholder="000-000-000-00000"
        keyboardType="number-pad"
        maxLength={TIN_MAX_LENGTH}
        error={errors.tin}
        disabled={disabled}
      />
      <TextField
        label="Branch code"
        hint="Head office is usually 000 or 00000."
        isOptional
        isMono
        value={form.tinBranchCode}
        onChangeText={(raw) => onChange({ tinBranchCode: formatBranchCodeInput(raw) })}
        placeholder="00000"
        keyboardType="number-pad"
        maxLength={BRANCH_CODE_MAX_LENGTH}
        error={errors.tinBranchCode}
        disabled={disabled}
      />
      <TextField
        label="Registered address"
        isOptional
        value={form.businessAddress}
        onChangeText={(businessAddress) => onChange({ businessAddress })}
        maxLength={TAX_TEXT_LIMITS.businessAddress}
        multiline
        error={errors.businessAddress}
        disabled={disabled}
      />
      <HeaderPreview form={form} />
    </SettingsCard>
  );
}
