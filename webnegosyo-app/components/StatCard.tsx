import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, radius, shadow, spacing } from "../theme/colors";

interface StatCardProps {
  value: string | number;
  label: string;
  /** Optional secondary hint under the label (e.g. a trend). */
  hint?: string;
}

export function StatCard({ value, label, hint }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  label: { ...typography.eyebrow, color: colors.textSecondary },
  value: { ...typography.title, color: colors.textPrimary, marginTop: spacing.xs },
  hint: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
});
