import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NEW_CAMPAIGN_STEPS, STEP_LABELS, type WizardStep } from "../../../lib/sms/campaign-wizard";
import { colors, spacing, typography } from "../../../theme/colors";

/**
 * Where the merchant is in the five questions.
 *
 * A rail of segments rather than numbered circles: the count is the useful
 * part ("two more after this"), and the labels under it tell the merchant
 * what is still to come without a tap.
 */
export function WizardProgress({ step }: { step: WizardStep }) {
  const current = NEW_CAMPAIGN_STEPS.indexOf(step);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${NEW_CAMPAIGN_STEPS.length}: ${STEP_LABELS[step]}`}
    >
      <View style={styles.rail}>
        {NEW_CAMPAIGN_STEPS.map((candidate, index) => (
          <View
            key={candidate}
            style={[
              styles.segment,
              index < current && styles.segmentDone,
              index === current && styles.segmentCurrent,
            ]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        {NEW_CAMPAIGN_STEPS.map((candidate, index) => (
          <Text
            key={candidate}
            style={[styles.label, index === current && styles.labelCurrent]}
            numberOfLines={1}
          >
            {STEP_LABELS[candidate]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: 6 },
  rail: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.separator },
  segmentDone: { backgroundColor: colors.primary },
  segmentCurrent: { backgroundColor: colors.accent },
  labels: { flexDirection: "row", gap: 4 },
  label: { ...typography.small, flex: 1, color: colors.textSecondary, fontWeight: "600" },
  labelCurrent: { color: colors.textPrimary, fontWeight: "800" },
});
