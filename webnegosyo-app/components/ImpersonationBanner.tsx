import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/auth-store";
import {
  exitTenant,
  impersonatedTenantName,
  isImpersonating,
} from "../lib/impersonation";
import { SUPERADMIN_LANDING_HREF } from "../lib/session-resolve";
import { colors, typography, radius, spacing } from "../theme/colors";

/**
 * Shown across the merchant surface while a superadmin is viewing someone
 * else's store, so it is never ambiguous whose data is on screen — and there is
 * always one tap back to the platform console.
 *
 * Renders nothing for an ordinary merchant admin: they own their tenant rather
 * than borrowing it.
 */
export function ImpersonationBanner() {
  const state = useAuthStore();
  const insets = useSafeAreaInsets();

  if (!isImpersonating(state)) return null;

  const handleExit = () => {
    useAuthStore.getState().setAuth(exitTenant(useAuthStore.getState()));
    router.replace(SUPERADMIN_LANDING_HREF);
  };

  return (
    <View style={[styles.banner, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.text} numberOfLines={1}>
        Viewing{" "}
        <Text style={styles.tenant}>{impersonatedTenantName(state)}</Text> as
        superadmin
      </Text>
      <TouchableOpacity
        style={styles.exitButton}
        onPress={handleExit}
        activeOpacity={0.8}
      >
        <Text style={styles.exitText}>Exit</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.heroInk,
  },
  text: { ...typography.caption, color: colors.heroInkMuted, flex: 1 },
  tenant: { color: colors.heroInkText, fontWeight: "700" },
  exitButton: {
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  exitText: { ...typography.caption, color: colors.heroInkText, fontWeight: "700" },
});
