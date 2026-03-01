import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, typography, radius, shadow, spacing } from "../theme/colors";

interface CardProps {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
}

export function Card({ children, title, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  title: { ...typography.caption, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm },
});
