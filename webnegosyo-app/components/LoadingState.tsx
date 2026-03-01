import React from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme/colors";

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingState({ message = "Loading...", fullScreen = false }: LoadingStateProps) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 12 },
  fullScreen: { flex: 1, backgroundColor: colors.background },
  text: { ...typography.caption, color: colors.textSecondary },
});
