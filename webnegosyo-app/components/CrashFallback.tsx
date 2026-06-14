import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { colors, typography, radius, spacing } from "../theme/colors";

interface CrashFallbackProps {
  /** The error that was thrown during render (from an ErrorBoundary). */
  error?: { message?: string } | null;
  /** Re-render the failed subtree (expo-router's `retry`). */
  onRetry?: () => void;
  /** Clear the session and return to the login screen. */
  onSignOut?: () => void;
}

/**
 * Last-resort UI shown when a screen throws during render. Without an Error
 * Boundary a render throw force-closes the whole app (it just "exits"); this
 * keeps the process alive, shows the user a recoverable screen, and surfaces
 * the underlying error message so the failure is diagnosable instead of silent.
 */
export function CrashFallback({ error, onRetry, onSignOut }: CrashFallbackProps) {
  const message = error?.message?.trim() || "An unexpected error occurred.";
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Try again, or sign out and back in.
        </Text>
        <ScrollView style={styles.detailBox} contentContainerStyle={styles.detailContent}>
          <Text style={styles.detailText}>{message}</Text>
        </ScrollView>
        <View style={styles.actions}>
          {onRetry && (
            <TouchableOpacity style={styles.primaryButton} onPress={onRetry} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}
          {onSignOut && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onSignOut} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Sign Out</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.textPrimary, textAlign: "center" },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  detailBox: {
    maxHeight: 140,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  detailContent: { padding: spacing.md },
  detailText: { ...typography.caption, color: colors.textSecondary },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  secondaryButtonText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
});
