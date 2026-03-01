import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, typography, radius } from "../theme/colors";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong", onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Oops</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  title: { ...typography.heading, color: colors.textPrimary },
  message: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  button: { marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: radius.sm },
  buttonText: { ...typography.body, color: "#FFFFFF", fontWeight: "600" },
});
