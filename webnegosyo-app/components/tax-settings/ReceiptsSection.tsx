import React from "react";
import { NOT_AN_INVOICE_NOTICE } from "../../lib/gov-discount";
import { TAX_TEXT_LIMITS } from "../../lib/tax-settings/form";
import { Note, PaperPreview, SettingsCard, SwitchRow, TextField } from "./parts";
import type { TaxSectionProps } from "./RegistrationSection";

/** BIR-registered POS (Permit To Use) — or the notice every receipt will carry. */
export function ReceiptsSection({ form, errors, onChange, disabled }: TaxSectionProps) {
  return (
    <SettingsCard
      title="Receipts"
      description="Only a point-of-sale system the BIR has accredited can print official invoices."
    >
      <SwitchRow
        label="My POS is BIR-registered (has a Permit To Use)"
        hint="Leave this off unless the BIR issued a PTU for this register."
        value={form.isBirRegisteredPos}
        onChange={(isBirRegisteredPos) => onChange({ isBirRegisteredPos })}
        disabled={disabled}
      />
      {form.isBirRegisteredPos ? (
        <>
          <TextField
            label="MIN"
            hint="Machine Identification Number"
            isMono
            value={form.posMin}
            onChangeText={(posMin) => onChange({ posMin })}
            maxLength={TAX_TEXT_LIMITS.posMin}
            autoCapitalize="characters"
            error={errors.posMin}
            disabled={disabled}
          />
          <TextField
            label="Serial no."
            hint="Printed on your PTU"
            isOptional
            isMono
            value={form.posSerialNo}
            onChangeText={(posSerialNo) => onChange({ posSerialNo })}
            maxLength={TAX_TEXT_LIMITS.posSerialNo}
            autoCapitalize="characters"
            error={errors.posSerialNo}
            disabled={disabled}
          />
          <TextField
            label="PTU no."
            hint="Permit To Use number"
            isMono
            value={form.posPtuNo}
            onChangeText={(posPtuNo) => onChange({ posPtuNo })}
            maxLength={TAX_TEXT_LIMITS.posPtuNo}
            autoCapitalize="characters"
            error={errors.posPtuNo}
            disabled={disabled}
          />
        </>
      ) : (
        <>
          <PaperPreview label="Your receipts will end with" lines={[{ text: NOT_AN_INVOICE_NOTICE, isBold: true }]} />
          <Note>
            Under BIR RR 7-2024, a receipt from a system without a Permit To Use is not an official invoice and
            has to say so. Senior and PWD discounts are still worked out and recorded in full.
          </Note>
        </>
      )}
    </SettingsCard>
  );
}
