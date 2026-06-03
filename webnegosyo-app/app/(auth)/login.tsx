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
import { colors, typography, radius, spacing } from "../../theme/colors";

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

      const { data: appUser, error: appUserError } = await supabase
        .from("app_users")
        .select("tenant_id, role")
        .eq("user_id", authData.user.id)
        .in("role", ["admin", "superadmin"])
        .single();

      if (appUserError || !appUser) {
        await supabase.auth.signOut();
        throw new Error("You do not have admin access");
      }

      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id, slug, name, convex_deployment_url")
        .eq("id", appUser.tenant_id)
        .single();

      if (tenantError || !tenant) {
        await supabase.auth.signOut();
        throw new Error("Tenant not found");
      }

      setAuth({
        userId: authData.user.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        convexUrl: tenant.convex_deployment_url ?? null,
        isLoading: false,
        isAuthenticated: true,
      });

      router.replace("/(main)/dashboard");
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
              <ActivityIndicator color="#fff" />
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
  title: { fontSize: 28, fontWeight: "700", color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  form: { gap: spacing.lg },
  inputGroup: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "500", marginLeft: spacing.xs },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.xs },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.separator },
  dividerText: { ...typography.caption, color: colors.textTertiary },
  secondaryButton: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  signupLink: { alignItems: "center", paddingVertical: spacing.sm },
  signupText: { ...typography.body, color: colors.textSecondary },
  signupTextBold: { color: colors.primary, fontWeight: "600" },
});
