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
import { ScreenHeader } from "../../components/superadmin/ScreenHeader";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

/** One label/value line inside a grouped card. */
function InfoRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowDivided]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
}

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
      <ScreenHeader
        eyebrow="Platform"
        title="Settings"
        subtitle="Platform console account"
      />

      <View style={styles.body}>
        <View style={styles.identityCard}>
          <View style={styles.identityBadge}>
            <Text style={styles.identityBadgeText}>SA</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityRole}>Superadmin</Text>
            <Text style={styles.identityHint}>
              Full platform access across every restaurant
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <InfoRow label="Role" value="superadmin" />
          <InfoRow label="User ID" value={userId ?? "—"} isLast />
        </View>

        <Text style={styles.sectionTitle}>Web-only tools</Text>
        <View style={styles.card}>
          {/* Named explicitly so the console never looks broken — these are
              deliberately not on mobile, not missing. */}
          <InfoRow label="Branding Studio" value="Web console" />
          <InfoRow label="Convex / Supabase deploys" value="Web console" />
          <InfoRow label="MCP API keys" value="Web console" isLast />
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl * 2 },
  body: { padding: spacing.lg, gap: spacing.md },

  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  identityBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md + 4,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  identityBadgeText: {
    color: colors.textOnDark,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
  },
  identityText: { flex: 1, gap: 2 },
  identityRole: { ...typography.heading, color: colors.textPrimary },
  identityHint: { ...typography.small, color: colors.textSecondary },

  sectionTitle: {
    ...typography.eyebrow,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoRowDivided: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  infoLabel: { ...typography.body, color: colors.textPrimary },
  infoValue: { ...typography.caption, color: colors.textTertiary, flexShrink: 1 },

  signOutButton: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  signOutText: { color: colors.danger, fontSize: 16, fontWeight: "700" },
});
