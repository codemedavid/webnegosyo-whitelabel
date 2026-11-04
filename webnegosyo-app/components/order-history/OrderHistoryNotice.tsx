import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Icon } from "../Icon";
import { colors, radius, spacing, typography } from "../../theme/colors";

/** One quiet line above the history list (e.g. "Showing the first 10,000 orders…"). Nothing when null. */
export function OrderHistoryNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Icon name="info" size={16} color={colors.statusPending.text} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  text: { ...typography.caption, flex: 1, fontWeight: "600", color: colors.statusPending.text },
});
