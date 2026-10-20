import React from "react";
import type { ApprovalRule, ServiceChargeMode } from "../../lib/gov-discount";
import { ChoiceCards, Note, SettingsCard, TextField, type ChoiceOption } from "./parts";
import type { TaxSectionProps } from "./RegistrationSection";

const RULE_OPTIONS: readonly ChoiceOption<ApprovalRule>[] = [
  { value: "never", title: "Never", hint: "Cashiers apply discounts on their own." },
  { value: "above", title: "Above an amount", hint: "A manager's PIN for big discounts only." },
  { value: "always", title: "Always", hint: "A manager's PIN for every discount." },
];

const MODE_OPTIONS: readonly ChoiceOption<ServiceChargeMode>[] = [
  {
    value: "full",
    title: "Charge in full (recommended)",
    hint: "The service charge is worked out on the bill before any discount.",
  },
  {
    value: "exempt_share",
    title: "Remove VAT from their share",
    hint: "The senior's or PWD's share of the service charge is VAT-free, like their food.",
  },
];

const THRESHOLD_MAX_LENGTH = 10;

/** When a manager's PIN is asked for: never, above ₱X, or always. */
export function ApprovalRuleSection({ form, errors, onChange, disabled }: TaxSectionProps) {
  return (
    <SettingsCard
      title="Manager approval"
      description="Choose when a manager has to type their PIN on the register before a Senior/PWD discount goes through."
    >
      <ChoiceCards
        label="When to ask for a manager's PIN"
        options={RULE_OPTIONS}
        value={form.approvalRule}
        onChange={(approvalRule) => onChange({ approvalRule })}
        disabled={disabled}
      />
      {form.approvalRule === "above" ? (
        <TextField
          label="Ask for a PIN when a discount takes off more than"
          hint="Counts everything taken off the bill: the 20% plus any VAT removed."
          prefix="₱"
          isMono
          value={form.approvalThreshold}
          onChangeText={(approvalThreshold) => onChange({ approvalThreshold })}
          keyboardType="decimal-pad"
          maxLength={THRESHOLD_MAX_LENGTH}
          error={errors.approvalThreshold}
          disabled={disabled}
        />
      ) : null}
      <Note>
        Every discount is recorded in your Senior/PWD sales book either way. A PIN only shows a manager checked
        it — the customer still gets their discount. If the register is offline, the sale still goes through and
        is flagged for you to review.
      </Note>
    </SettingsCard>
  );
}

/** How a claimant's share of a service charge is handled (VAT stores only). */
export function ServiceChargeSection({ form, onChange, disabled }: TaxSectionProps) {
  return (
    <SettingsCard title="Service charge" description="Only matters if you add a service charge to bills.">
      <ChoiceCards
        label="How a Senior/PWD share of the service charge is handled"
        options={MODE_OPTIONS}
        value={form.serviceChargeMode}
        onChange={(serviceChargeMode) => onChange({ serviceChargeMode })}
        disabled={disabled}
      />
      {form.vatStatus === "non_vat" ? (
        <Note>
          You’re Non-VAT, so there’s no VAT to remove — the service charge is charged in full either way.
        </Note>
      ) : null}
      <Note>Not sure which one your store follows? Confirm with your accountant before changing it.</Note>
    </SettingsCard>
  );
}
