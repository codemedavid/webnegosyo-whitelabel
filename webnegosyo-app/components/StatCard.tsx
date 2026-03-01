import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, radius, shadow, spacing } from "../theme/colors";

interface StatCardProps {
  value: string | number;
  label: string;
}

export function StatCard({ value, label }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  value: { ...typography.title, color: colors.textPrimary },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
