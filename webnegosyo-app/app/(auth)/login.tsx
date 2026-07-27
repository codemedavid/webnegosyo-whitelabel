import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, type Href } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_STORE } from "../../lib/demo";
import {
  needsTenantLookup,
  resolveSession,
  type TenantRow,
} from "../../lib/session-resolve";
import { colors, typography, radius, spacing, shadow } from "../../theme/colors";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleExploreDemo = () => {
    // No credentials needed — Convex reads are public. Marks the session
    // read-only so a guest can browse without altering real data.
    setAuth({
      userId: null,
      tenantId: DEMO_STORE.tenantId,
      tenantSlug: DEMO_STORE.tenantSlug,
      tenantName: DEMO_STORE.tenantName,
      convexUrl: DEMO_STORE.convexUrl,
      isLoading: false,
      isAuthenticated: true,
      isDemo: true,
    });
    router.replace("/(main)/dashboard");
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setIsLoading(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) throw authError;
      if (!authData.user) throw new Error("No user returned");

      const { data: appUser } = await supabase
        .from("app_users")
        .select("tenant_id, role, is_owner, permissions")
        .eq("user_id", authData.user.id)
        .in("role", ["admin", "superadmin"])
        .single();

      // A superadmin owns no tenant, so skip a lookup that would always miss.
      let tenant: TenantRow | null = null;
      if (appUser && needsTenantLookup(appUser)) {
        const { data: tenantRow } = await supabase
          .from("tenants")
          .select("id, slug, name, convex_deployment_url, order_backend")
          .eq("id", appUser.tenant_id)
          .single();
        tenant = (tenantRow as TenantRow | null) ?? null;
      }

      const session = resolveSession(authData.user.id, appUser ?? null, tenant);

      if (session.mode === "denied" || !session.auth || !session.landingHref) {
        await supabase.auth.signOut();
        throw new Error(session.reason ?? "You do not have admin access");
      }

      // Navigation is deliberately NOT dispatched here. Setting the store is
      // enough: useAuthRedirect in the root layout owns post-auth routing and
      // sends the session to its landing surface. Replacing from here as well
      // races that hook — it re-fires against stale segments and replaces a
      // second time, remounting the target tab navigator while its nested
      // params are already consumed, which crashes react-navigation with
      // "Cannot read property 'stale' of undefined".
      setAuth(session.auth);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Login failed";
      Alert.alert("Login Failed", message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Merchant Admin</Text>
          <Text style={styles.title}>WebNegosyo</Text>
          <Text style={styles.subtitle}>
            Run your store from anywhere — for any food or retail business
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleExploreDemo}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              Explore Demo — no account needed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signupLink}
            onPress={() => router.push("/(auth)/signup" as Href)}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <Text style={styles.signupText}>
              New here?{" "}
              <Text style={styles.signupTextBold}>Create your store</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  header: { alignItems: "center", marginBottom: 48 },
  eyebrow: { ...typography.eyebrow, color: colors.accent, marginBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  form: { gap: spacing.lg },
  inputGroup: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", marginLeft: spacing.xs },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.textOnDark, fontSize: 17, fontWeight: "800" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.xs },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.separator },
  dividerText: { ...typography.eyebrow, color: colors.textTertiary },
  secondaryButton: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
    ...shadow.sm,
  },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  signupLink: { alignItems: "center", paddingVertical: spacing.sm },
  signupText: { ...typography.body, color: colors.textSecondary },
  signupTextBold: { color: colors.accent, fontWeight: "700" },
});
