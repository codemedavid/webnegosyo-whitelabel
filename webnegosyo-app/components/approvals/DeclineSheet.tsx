import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DECLINE_REASONS } from "../../lib/approvals/types";
import { colors, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";
import { ReasonPicker } from "./ReasonPicker";

export interface DeclineChoice {
  reasonCode: string;
  note?: string;
}

interface DeclineSheetProps {
  visible: boolean;
  requesterFirstName: string;
  isBusy: boolean;
  error: string | null;
  onConfirm: (choice: DeclineChoice) => void;
  onClose: () => void;
}

function hintFor(reasonCode: string | null, note: string): string | null {
  if (!reasonCode) return "Pick a reason first";
  if (reasonCode === "other" && note.trim() === "") return "Add a detail for Other";
  return null;
}

/**
 * Decline with a reason (design-spec P5, §4): the reasons describe the next
 * step, never the person, and the requester sees both the chip and the
 * note. Nothing is pre-selected, and there is no separate "Are you sure?".
 */
export function DeclineSheet({ visible, requesterFirstName, isBusy, error, onConfirm, onClose }: DeclineSheetProps) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!visible) return;
    setReasonCode(null);
    setNote("");
  }, [visible]);

  const hint = hintFor(reasonCode, note);
  const submit = () => {
    if (hint || !reasonCode) return;
    const trimmed = note.trim();
    onConfirm({ reasonCode, ...(trimmed ? { note: trimmed } : {}) });
  };

  return (
    <DrawerSheet
      visible={visible}
      title="Decline"
      subtitle={`${requesterFirstName} sees your reason and note.`}
      onClose={onClose}
      isBusy={isBusy}
      closeLabel="Back"
    >
      <ReasonPicker
        reasons={DECLINE_REASONS}
        reasonCode={reasonCode}
        note={note}
        notePlaceholder={`Tell ${requesterFirstName} what to do next (optional)`}
        onReason={setReasonCode}
        onNote={setNote}
      />
      <View style={styles.dock}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <Button
          label={`Decline and tell ${requesterFirstName}`}
          size="lg"
          onPress={submit}
          disabled={hint !== null}
          isLoading={isBusy}
          accessibilityHint={hint ?? undefined}
        />
      </View>
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  dock: { marginTop: spacing.lg, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600", textAlign: "center" },
});
