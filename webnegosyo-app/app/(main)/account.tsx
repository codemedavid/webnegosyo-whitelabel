import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/auth-store";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";

const SUPPORT_EMAIL = "support@webnegosyo.com";

export default function AccountScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const isDemo = useAuthStore((s) => s.isDemo);
  const clear = useAuthStore((s) => s.clear);

  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // A demo session has no Supabase user, so only look one up for real merchants.
  useEffect(() => {
    if (isDemo) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    return () => {
      active = false;
    };
  }, [isDemo]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // No active session (e.g. demo) — ignore.
    }
    clear();
    router.replace("/(auth)/login");
  };

  const performDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", {
        method: "POST",
      });

      if (error) {
        // FunctionsHttpError carries the original Response on `context`; pull the
        // server's error message out of it for a clearer alert.
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          } catch {
            // Response body was not JSON — keep the generic message.
          }
        }
        throw new Error(detail);
      }
      if (data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }

      // The account (and its server session) no longer exists, so a global
      // sign-out would just error. A local-scope sign-out clears the cached
      // token without needing the server; then reset state and return to login.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Token already cleared — ignore.
      }
      clear();
      Alert.alert(
        "Account deleted",
        "Your account and sign-in access have been permanently deleted."
      );
      router.replace("/(auth)/login");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete your account.";
      Alert.alert(
        "Deletion failed",
        `${msg}\n\nPlease try again, or email ${SUPPORT_EMAIL} for help.`
      );
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your sign-in account and removes your access to this store. Your store's existing orders and menu are not deleted. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Account", style: "destructive", onPress: performDelete },
      ]
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Account</Text>

      <Card title="Signed in as" style={styles.section}>
        <Text style={styles.value}>{tenantName ?? "Your store"}</Text>
        <Text style={styles.sub}>{isDemo ? "Demo session — no account" : email ?? "—"}</Text>
      </Card>

      {isDemo && (
        <View style={styles.demoNote}>
          <Text style={styles.demoNoteText}>
            You&apos;re exploring the demo. Sign in with a merchant account to
            manage account settings and deletion.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        disabled={signingOut || deleting}
        activeOpacity={0.8}
      >
        {signingOut ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>

      {!isDemo && (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <Text style={styles.dangerBody}>
            Permanently delete your sign-in account and remove your access to
            this store. Your store&apos;s orders and menu are preserved. This
            cannot be undone.
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={confirmDelete}
            disabled={deleting}
            activeOpacity={0.8}
          >
            {deleting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  backButton: { marginBottom: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  value: { ...typography.heading, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  demoNote: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  demoNoteText: { ...typography.caption, color: colors.textSecondary },
  signOutButton: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  signOutText: { ...typography.heading, color: colors.primary },
  dangerZone: {
    marginTop: spacing.xxl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerLight,
    backgroundColor: colors.card,
    padding: spacing.lg,
  },
  dangerTitle: { ...typography.heading, color: colors.danger, marginBottom: spacing.xs },
  dangerBody: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  deleteButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteButtonText: { ...typography.heading, color: "#FFFFFF" },
});
