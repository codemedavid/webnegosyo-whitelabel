import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/colors";

/**
 * "Senior/PWD discount applies" — the one switch the product and category
 * editors share. On by default: the law covers food and drink, so an item is
 * covered unless the owner excludes it (the register honours the item's switch
 * AND its category's).
 */
interface GovEligibleSwitchProps {
  /** Undefined when the row did not say: shown as on, the database default. */
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  /** "item" on a product, "section" on a category. */
  subject: "item" | "section";
  disabled?: boolean;
}

export const GOV_ELIGIBLE_LABEL = "Senior/PWD discount applies";
export const GOV_ELIGIBLE_HINT =
  "Turn off for items the law does not cover, like retail merchandise or gift cards.";

export function GovEligibleSwitch({ value, onChange, subject, disabled }: GovEligibleSwitchProps) {
  const isOn = value ?? true;
  const offNote =
    subject === "section"
      ? "Off for every item in this section, whatever each item says."
      : "Off: the register will not discount this item for a Senior or PWD.";
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{GOV_ELIGIBLE_LABEL}</Text>
        <Text style={styles.hint}>{GOV_ELIGIBLE_HINT}</Text>
        {!isOn ? <Text style={styles.offNote}>{offNote}</Text> : null}
      </View>
      <Switch
        value={isOn}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.separator, true: colors.success }}
        accessibilityLabel={GOV_ELIGIBLE_LABEL}
        accessibilityHint={GOV_ELIGIBLE_HINT}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  copy: { flex: 1 },
  label: { ...typography.eyebrow, color: colors.textSecondary, marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textSecondary },
  offNote: { ...typography.caption, color: colors.textPrimary, fontWeight: "600", marginTop: spacing.xs },
});
