import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { signOutThisDevice } from "../../lib/sign-out";
import { useAuthStore } from "../../stores/auth-store";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { BackHeader } from "../../components/BackHeader";
import { ListRow } from "../../components/ListRow";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";

const SUPPORT_EMAIL = "support@webnegosyo.com";

/**
 * The account, and only the account: who is signed in, how to sign out, and
 * how to delete it. Team, the guided tour and What's New used to be listed
 * here too; they are setup and help, so they live under Manage now, and this
 * screen no longer doubles as a second, smaller hub.
 */
export default function AccountScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const outletName = useAuthStore((s) => s.outletName);
  const isDemo = useAuthStore((s) => s.isDemo);
  const isOwner = useAuthStore((s) => s.isOwner);
  const role = useAuthStore((s) => s.role);
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

  const roleLabel = isDemo
    ? "Demo session, no account"
    : isOwner
      ? "Owner"
      : role === "superadmin"
        ? "Superadmin"
        : "Staff";

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutThisDevice(supabase);
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
        await signOutThisDevice(supabase);
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
    <View style={styles.screen}>
      <BackHeader title="Account" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <ListRow
            icon="account"
            title={tenantName ?? "Your store"}
            subtitle={isDemo ? roleLabel : email ?? "Signed in"}
            accessibilityLabel={`Signed in as ${tenantName ?? "your store"}`}
            grouped
          />
          <ListRow
            icon="storefront"
            title={outletName ?? "All branches"}
            subtitle={roleLabel}
            accessibilityLabel={`${roleLabel}${outletName ? ` at ${outletName}` : ""}`}
          />
        </View>

        <View style={styles.group}>
          <ListRow
            icon="logout"
            title="Sign Out"
            subtitle={signingOut ? "Signing out…" : "Return to the sign-in screen"}
            accessibilityLabel="Sign Out"
            onPress={signingOut || deleting ? undefined : handleSignOut}
            trailing={signingOut ? <ActivityIndicator color={colors.primary} /> : undefined}
          />
        </View>

        {!isDemo && isOwner && role === "admin" && (
          <View style={styles.group}>
            <ListRow
              icon="trash"
              tone="danger"
              title="Delete orders"
              subtitle="Remove test orders or reset your dashboard"
              accessibilityLabel="Delete orders"
              onPress={() => router.push("/(main)/delete-orders")}
            />
          </View>
        )}

        {isDemo && (
          <View style={styles.demoNote}>
            <Text style={styles.demoNoteText}>
              You&apos;re exploring the demo. Sign in with a merchant account to
              manage account settings and deletion.
            </Text>
          </View>
        )}

        {!isDemo && (
          <>
            <SectionHeader title="Delete account" />
            <View style={styles.dangerZone}>
              <Text style={styles.dangerBody}>
                Permanently delete your sign-in account and remove your access to
                this store. Your store&apos;s orders and menu are preserved. This
                cannot be undone.
              </Text>
              <Button
                label="Delete Account"
                tone="danger"
                onPress={confirmDelete}
                isLoading={deleting}
                fullWidth
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  demoNote: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  demoNoteText: { ...typography.caption, color: colors.textSecondary },
  dangerZone: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dangerLight,
    backgroundColor: colors.card,
    padding: spacing.xl,
  },
  dangerBody: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
});
