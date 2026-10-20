/**
 * The signed-in manager's own approval PIN — typed on the cashier's register to
 * approve a large Senior/PWD discount.
 *
 * Whether a PIN already exists is not readable from the app
 * (`staff_approval_pins` is service-role only), so the card never claims one
 * way or the other: it sets or replaces. The server decides what is too easy to
 * guess, and its words are shown as-is.
 */
import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { saveOwnApprovalPin } from "../../lib/gov-ledger/approval-client";
import { formatPinInput, PIN_MAX_LENGTH, validateApprovalPin, type ApprovalPinErrors } from "../../lib/tax-settings/approval-pin";
import { colors, typography } from "../../theme/colors";
import { Button } from "../Button";
import { SettingsCard, TextField } from "./parts";

interface ApprovalPinCardProps {
  tenantId: string;
}

export function ApprovalPinCard({ tenantId }: ApprovalPinCardProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [errors, setErrors] = useState<ApprovalPinErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = async () => {
    const problems = validateApprovalPin(pin, confirmPin);
    setErrors(problems);
    setSavedMessage(null);
    if (problems.pin || problems.confirmPin) return;
    setIsSaving(true);
    try {
      const result = await saveOwnApprovalPin(tenantId, pin);
      if (!result.ok) {
        setErrors({ pin: result.message });
        return;
      }
      setPin("");
      setConfirmPin("");
      setSavedMessage("Your PIN is saved. Use it on the register when a discount needs a manager.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Your approval PIN"
      description="When a discount needs a manager, you type this PIN on the cashier's register. Setting one replaces any PIN you had. Keep it to yourself."
    >
      <TextField
        label="New PIN"
        hint="4 to 6 numbers. Avoid 1234 or your birthday."
        isMono
        value={pin}
        onChangeText={(raw) => setPin(formatPinInput(raw))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_MAX_LENGTH}
        autoComplete="off"
        textContentType="oneTimeCode"
        error={errors.pin}
        disabled={isSaving}
      />
      <TextField
        label="Type it again"
        isMono
        value={confirmPin}
        onChangeText={(raw) => setConfirmPin(formatPinInput(raw))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_MAX_LENGTH}
        autoComplete="off"
        textContentType="oneTimeCode"
        error={errors.confirmPin}
        disabled={isSaving}
      />
      {savedMessage ? (
        <Text style={styles.saved} accessibilityLiveRegion="polite">
          {savedMessage}
        </Text>
      ) : null}
      <Button label="Save PIN" tone="secondary" onPress={handleSave} isLoading={isSaving} fullWidth />
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  saved: { ...typography.caption, color: colors.success, fontWeight: "600" },
});
