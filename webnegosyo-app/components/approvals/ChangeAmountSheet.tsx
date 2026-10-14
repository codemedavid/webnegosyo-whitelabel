import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatPesoShort } from "../../lib/approvals/state";
import { colors, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { AmountChips, CashInput, DrawerSheet } from "../drawer/DrawerSheet";

interface ChangeAmountSheetProps {
  visible: boolean;
  /** What was asked: the most that can be approved. */
  max: number;
  requesterFirstName: string;
  onApply: (amount: number) => void;
  onClose: () => void;
}

function parse(text: string): number | null {
  const value = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/**
 * Approve less than asked (amount refunds only; design-spec §3.7.6). Capped
 * at the request; the slide then names the new amount, and the approval goes
 * through the same execution path.
 */
export function ChangeAmountSheet({ visible, max, requesterFirstName, onApply, onClose }: ChangeAmountSheetProps) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (visible) setText(String(max));
  }, [visible, max]);

  const amount = parse(text);
  const hint =
    amount === null ? "Enter an amount" : amount > max ? `Up to ${formatPesoShort(max)} (what ${requesterFirstName} asked for)` : null;
  const halves = [0.5, 0.75].map((share) => Math.round(max * share * 100) / 100).filter((value) => value > 0);

  return (
    <DrawerSheet visible={visible} title="Change amount" subtitle={`Up to ${formatPesoShort(max)}`} onClose={onClose} closeLabel="Back">
      <CashInput value={text} onChangeText={setText} accessibilityLabel="Amount to approve" hasError={hint !== null && amount !== null} />
      <AmountChips chips={halves.map((value) => ({ label: formatPesoShort(value), amount: value }))} onPick={(value) => setText(String(value))} />
      <View style={styles.dock}>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <Button
          label={amount !== null && hint === null ? `Use ${formatPesoShort(amount)}` : "Use this amount"}
          size="lg"
          disabled={hint !== null || amount === null}
          onPress={() => {
            if (amount !== null && hint === null) onApply(amount);
          }}
        />
      </View>
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  dock: { marginTop: spacing.lg, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
