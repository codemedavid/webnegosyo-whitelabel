import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme/colors";

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = "No data yet" }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  text: { ...typography.body, color: colors.textTertiary },
});
