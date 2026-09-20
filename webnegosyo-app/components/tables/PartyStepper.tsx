import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { IconButton } from "../IconButton";
import { OptionPills } from "../OptionPills";
import { partySizeWarning, stepPartySize } from "../../lib/tables/table-actions";

interface PartyStepperProps {
  value: number;
  seats: number;
  onChange: (value: number) => void;
}

const PRESETS = [1, 2, 4, 6] as const;

/** How many guests — a big number, two buttons, and the common sizes as one tap. */
export function PartyStepper({ value, seats, onChange }: PartyStepperProps) {
  const warning = partySizeWarning(value, seats);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <IconButton icon="minus" label="Fewer guests" onPress={() => onChange(stepPartySize(value, -1))} />
        <View style={styles.readout}>
          <Text style={styles.value} accessibilityLiveRegion="polite">
            {value}
          </Text>
          <Text style={styles.caption}>{value === 1 ? "guest" : "guests"}</Text>
        </View>
        <IconButton icon="plus" label="More guests" onPress={() => onChange(stepPartySize(value, 1))} />
      </View>
      <OptionPills<number>
        options={PRESETS.map((size) => ({ label: String(size), value: size }))}
        isSelected={(size) => size === value}
        onSelect={onChange}
        accessibilityPrefix="Party of"
      />
      <Text style={[styles.hint, warning ? styles.hintWarning : null]}>
        {warning ?? `This table seats ${seats}.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xl },
  readout: {
    minWidth: 120,
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
  },
  value: { fontSize: 44, fontWeight: "800", letterSpacing: -1, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  caption: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  hint: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  hintWarning: { color: colors.statusPending.text, fontWeight: "600" },
});
