import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../../theme/colors";

/**
 * The one question a step asks, as a question — "Who should get it?" — with a
 * line under it saying why it matters. Every step opens with one.
 */
export function StepIntro({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  title: { ...typography.title, fontSize: 26, letterSpacing: -0.4, color: colors.textPrimary },
  hint: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
});
