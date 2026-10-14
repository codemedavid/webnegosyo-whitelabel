import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { CANCEL_NOTE_MAX, CANCEL_REASONS, validateCancelReason, type CancelReason } from "../../lib/order-cancel-reason";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";
import { OptionPills } from "../OptionPills";

export interface CancelReasonChoice {
  reason: CancelReason;
  note: string | null;
}

interface CancelReasonSheetProps {
  visible: boolean;
  /** "#22" — names the order in the title. */
  orderLabel: string | null;
  isBusy: boolean;
  onConfirm: (choice: CancelReasonChoice) => void;
  onClose: () => void;
}

/**
 * Why is this order being cancelled? One required chip and an optional
 * detail, then a button named by its outcome (spec P5, §4) — no separate
 * "Are you sure?". The reason is what Store Activity shows next to the cancel.
 */
export function CancelReasonSheet({ visible, orderLabel, isBusy, onConfirm, onClose }: CancelReasonSheetProps) {
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState("");

  // Every opening is a fresh question.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote("");
    }
  }, [visible]);

  const check = validateCancelReason({ reason, note });
  const submit = () => {
    if (check.ok) onConfirm(check.value);
  };

  return (
    <DrawerSheet
      visible={visible}
      title={orderLabel ? `Cancel order ${orderLabel}?` : "Cancel this order?"}
      subtitle="It leaves the active queue and is not counted as a sale."
      onClose={onClose}
      isBusy={isBusy}
      closeLabel="Keep order"
    >
      <Text style={styles.label}>Why?</Text>
      <OptionPills
        options={CANCEL_REASONS.map((value) => ({ label: value, value }))}
        isSelected={(value) => reason === value}
        onSelect={setReason}
        accessibilityPrefix="Reason"
      />
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder={reason === "Other" ? "What happened?" : "Add a detail (optional)"}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Add a detail (optional)"
        maxLength={CANCEL_NOTE_MAX}
        multiline
      />
      <View style={styles.dock}>
        {check.ok ? null : <Text style={styles.hint}>{check.hint}</Text>}
        <Button
          label="Cancel order"
          tone="danger"
          onPress={submit}
          disabled={!check.ok}
          isLoading={isBusy}
          accessibilityHint={check.ok ? undefined : check.hint}
        />
      </View>
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  input: {
    ...typography.body,
    minHeight: 48,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    color: colors.textPrimary,
  },
  dock: { marginTop: spacing.lg, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
