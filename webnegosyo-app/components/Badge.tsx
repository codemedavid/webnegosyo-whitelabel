import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radius } from "../theme/colors";

type BadgeVariant = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled" | "default";

const BADGE_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  pending: colors.statusPending,
  confirmed: colors.statusConfirmed,
  preparing: colors.statusPreparing,
  ready: colors.statusReady,
  delivered: colors.statusDelivered,
  cancelled: colors.statusCancelled,
  default: { bg: colors.separator, text: colors.textSecondary },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "default" }: BadgeProps) {
  const badgeColors = BADGE_COLORS[variant] ?? BADGE_COLORS.default;
  return (
    <View style={[styles.badge, { backgroundColor: badgeColors.bg }]}>
      <Text style={[styles.text, { color: badgeColors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  text: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
});
