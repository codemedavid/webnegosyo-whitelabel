import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/auth-store";
import { colors, typography, radius, spacing, shadow } from "../../theme/colors";

export default function SuperadminSettingsScreen() {
  const userId = useAuthStore((s) => s.userId);
  const clear = useAuthStore((s) => s.clear);

  const handleSignOut = () => {
    Alert.alert("Sign out", "Sign out of the platform console?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch {
            // No session to clear — fall through to the local reset.
          }
          clear();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Platform</Text>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>Superadmin</Text>
        <Text style={styles.hint}>{userId ?? "—"}</Text>
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        activeOpacity={0.8}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow.sm,
  },
  label: { ...typography.eyebrow, color: colors.textSecondary },
  value: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.xs },
  hint: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
  signOutButton: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.md,
  },
  signOutText: { color: colors.danger, fontSize: 16, fontWeight: "700" },
});
