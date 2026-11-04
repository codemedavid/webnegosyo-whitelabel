import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BillPreset } from "../../../lib/expenses/bill-schedule";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { Chip } from "../AddExpenseParts";

interface BillsEmptyProps {
  presets: readonly BillPreset[];
  canAdd: boolean;
  onPreset: (preset: BillPreset) => void;
  onAdd: () => void;
}

/** No bills yet: what a bill is for, in one sentence, and one tap to start from a usual one. */
export function BillsEmpty({ presets, canAdd, onPreset, onAdd }: BillsEmptyProps) {
  return (
    <View style={styles.card}>
      <View style={styles.well}>
        <Icon name="calendar" size={22} color={colors.accent} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        No bills yet
      </Text>
      <Text style={styles.text}>
        Add what the store pays every month, like rent, kuryente or sahod. We remind you before each one is due, and you mark it paid in two taps.
      </Text>
      {canAdd ? (
        <>
          <View style={styles.chips}>
            {presets.map((preset) => (
              <Chip key={preset.key} label={preset.name} icon="plus" onPress={() => onPreset(preset)} accessibilityLabel={`Add ${preset.name}`} />
            ))}
          </View>
          <Button label="Add a bill" icon="plus" onPress={onAdd} fullWidth={false} style={styles.add} testID="bills-empty-add" />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: "center",
    ...shadow.sm,
  },
  well: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.accentLight, alignItems: "center", justifyContent: "center" },
  title: { ...typography.heading, color: colors.textPrimary },
  text: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  add: { alignSelf: "center", marginTop: spacing.xs },
});
