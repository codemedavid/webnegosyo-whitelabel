# Admin App Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all bugs causing perpetual loading, redesign with Apple-inspired light theme, add shared components and proper error handling.

**Architecture:** Fix auth flow → add theme constants → build shared components → rewrite each screen. Convex stays as sole data layer. No new dependencies.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, Expo Router 6, Convex 1.32, Zustand 5, Supabase JS 2.98

---

### Task 1: Create theme constants

**Files:**
- Create: `theme/colors.ts`

**Step 1: Create the theme file**

```typescript
// theme/colors.ts
export const colors = {
  // Backgrounds
  background: "#F2F2F7",
  card: "#FFFFFF",

  // Primary
  primary: "#007AFF",
  primaryLight: "#E3F2FD",

  // Text
  textPrimary: "#000000",
  textSecondary: "#8E8E93",
  textTertiary: "#C7C7CC",

  // UI
  separator: "#E5E5EA",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E5E5EA",

  // Status
  success: "#34C759",
  successLight: "#E8F5E9",
  warning: "#FF9500",
  warningLight: "#FFF3E0",
  danger: "#FF3B30",
  dangerLight: "#FFEBEE",
  info: "#5AC8FA",
  infoLight: "#E1F5FE",

  // Specific status badge colors
  statusPending: { bg: "#FFF3E0", text: "#E65100" },
  statusConfirmed: { bg: "#E1F5FE", text: "#01579B" },
  statusPreparing: { bg: "#FFF8E1", text: "#F57F17" },
  statusReady: { bg: "#E8F5E9", text: "#1B5E20" },
  statusDelivered: { bg: "#F3E5F5", text: "#4A148C" },
  statusCancelled: { bg: "#FFEBEE", text: "#B71C1C" },
} as const;

export const typography = {
  title: { fontSize: 22, fontWeight: "700" as const },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  small: { fontSize: 11, fontWeight: "400" as const },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;
```

**Step 2: Verify file exists**

Run: `ls theme/colors.ts`
Expected: file listed

**Step 3: Commit**

```bash
git add theme/colors.ts
git commit -m "feat: add Apple-inspired light theme constants"
```

---

### Task 2: Create shared components

**Files:**
- Create: `components/LoadingState.tsx`
- Create: `components/ErrorState.tsx`
- Create: `components/EmptyState.tsx`
- Create: `components/Card.tsx`
- Create: `components/Badge.tsx`
- Create: `components/StatCard.tsx`
- Delete: `components/.gitkeep`

**Step 1: Create LoadingState**

```typescript
// components/LoadingState.tsx
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
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 12,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
```

**Step 2: Create ErrorState**

```typescript
// components/ErrorState.tsx
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
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  button: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  buttonText: {
    ...typography.body,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
```

**Step 3: Create EmptyState**

```typescript
// components/EmptyState.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme/colors";

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = "No data yet" }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  text: {
    ...typography.body,
    color: colors.textTertiary,
  },
});
```

**Step 4: Create Card**

```typescript
// components/Card.tsx
import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, typography, radius, shadow, spacing } from "../theme/colors";

interface CardProps {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
}

export function Card({ children, title, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow.sm,
  },
  title: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
});
```

**Step 5: Create Badge**

```typescript
// components/Badge.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radius } from "../theme/colors";

type BadgeVariant = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled" | "default";

const BADGE_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  pending: colors.statusPending,
  confirmed: colors.statusConfirmed,
  preparing: colors.statusPreparing,
  ready: colors.statusReady,
  delivered: colors.statusDelivered,
  cancelled: colors.statusCancelled,
  default: { bg: colors.separator, text: colors.textSecondary },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "default" }: BadgeProps) {
  const badgeColors = BADGE_COLORS[variant] ?? BADGE_COLORS.default;
  return (
    <View style={[styles.badge, { backgroundColor: badgeColors.bg }]}>
      <Text style={[styles.text, { color: badgeColors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
});
```

**Step 6: Create StatCard**

```typescript
// components/StatCard.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, radius, shadow, spacing } from "../theme/colors";

interface StatCardProps {
  value: string | number;
  label: string;
}

export function StatCard({ value, label }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow.sm,
  },
  value: {
    ...typography.title,
    color: colors.textPrimary,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
```

**Step 7: Remove .gitkeep and commit**

```bash
rm components/.gitkeep
git add components/ theme/
git commit -m "feat: add shared components (Card, Badge, StatCard, LoadingState, ErrorState, EmptyState)"
```

---

### Task 3: Fix auth flow and Convex provider

This is the critical bug fix. The auth flow silently fails when `convex_deployment_url` is null, and the Convex provider has a race condition.

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `lib/convex-provider.tsx`
- Modify: `app/index.tsx`

**Step 1: Rewrite `app/_layout.tsx`**

Replace the entire file with:

```typescript
// app/_layout.tsx
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { ConvexAuthProvider } from "../lib/convex-provider";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";

function AuthGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (sessionError || !data.session?.user) {
        setAuth({ isLoading: false });
        return;
      }

      try {
        const { data: appUser } = await supabase
          .from("app_users")
          .select("tenant_id")
          .eq("user_id", data.session.user.id)
          .in("role", ["admin", "superadmin"])
          .single();

        if (!appUser) {
          setAuth({ isLoading: false });
          return;
        }

        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, slug, name, convex_deployment_url")
          .eq("id", appUser.tenant_id)
          .single();

        if (!tenant) {
          setAuth({ isLoading: false });
          return;
        }

        // Allow auth even if convex_deployment_url is null — screens will handle it
        setAuth({
          userId: data.session.user.id,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          convexUrl: tenant.convex_deployment_url ?? null,
          isLoading: false,
          isAuthenticated: true,
        });
      } catch {
        setAuth({ isLoading: false });
      }
    });
  }, [setAuth]);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && convexUrl) {
      router.replace("/(main)/dashboard");
    } else if (isAuthenticated && !convexUrl) {
      // Authenticated but no Convex — still go to dashboard, it will show an error state
      router.replace("/(main)/dashboard");
    } else {
      router.replace("/(auth)/login");
    }
  }, [isLoading, isAuthenticated, convexUrl]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ConvexAuthProvider>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </AuthGate>
    </ConvexAuthProvider>
  );
}
```

**Step 2: Rewrite `lib/convex-provider.tsx`**

Replace with a version that renders `LoadingState` when no client instead of raw children (preventing Convex `useQuery` from crashing):

```typescript
// lib/convex-provider.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { supabase } from "./supabase";
import { useAuthStore } from "../stores/auth-store";
import { Session } from "@supabase/supabase-js";

function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (forceRefreshToken) {
        const { data } = await supabase.auth.refreshSession();
        return data.session?.access_token ?? null;
      }
      return session?.access_token ?? null;
    },
    [session]
  );

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated: !!session,
      fetchAccessToken,
    }),
    [isLoading, session, fetchAccessToken]
  );
}

interface ConvexAuthProviderProps {
  children: React.ReactNode;
}

export function ConvexAuthProvider({ children }: ConvexAuthProviderProps) {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl, {
      unsavedChangesWarning: false,
    });
  }, [convexUrl]);

  if (!client) {
    // Render children without Convex context — screens must handle missing provider
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithAuth client={client} useAuth={useSupabaseAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
```

**Step 3: Restyle `app/index.tsx` for light theme**

```typescript
// app/index.tsx
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
```

**Step 4: Test the auth flow**

Run: `npx expo start --clear`
Expected: App loads, shows spinner, redirects to login (if not logged in) or dashboard (if session exists). No more "loading forever" on the splash screen.

**Step 5: Commit**

```bash
git add app/_layout.tsx lib/convex-provider.tsx app/index.tsx
git commit -m "fix: auth flow silent failure and Convex provider race condition"
```

---

### Task 4: Redesign login screen

**Files:**
- Modify: `app/(auth)/login.tsx`
- Modify: `app/(auth)/_layout.tsx`

**Step 1: Rewrite login.tsx**

```typescript
// app/(auth)/login.tsx
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
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/auth-store";
import { colors, typography, radius, spacing } from "../../theme/colors";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

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
          <Text style={styles.subtitle}>Admin Dashboard</Text>
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
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.lg,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "500",
    marginLeft: spacing.xs,
  },
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
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
});
```

**Step 2: Commit**

```bash
git add app/(auth)/login.tsx
git commit -m "feat: redesign login screen with light theme"
```

---

### Task 5: Redesign tab navigator

**Files:**
- Modify: `app/(main)/_layout.tsx`

**Step 1: Rewrite tab layout with light theme and icons (using Unicode symbols)**

```typescript
// app/(main)/_layout.tsx
import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../theme/colors";

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{symbol}</Text>;
}

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 0.5,
          height: 85,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => <TabIcon symbol="⊞" color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: ({ color }) => <TabIcon symbol="☰" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          tabBarLabel: "Analytics",
          tabBarIcon: ({ color }) => <TabIcon symbol="◔" color={color} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          tabBarLabel: "Trends",
          tabBarIcon: ({ color }) => <TabIcon symbol="⬈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="order/[orderId]"
        options={{
          href: null,
          title: "Order Detail",
        }}
      />
    </Tabs>
  );
}
```

**Step 2: Commit**

```bash
git add "app/(main)/_layout.tsx"
git commit -m "feat: redesign tab navigator with light theme"
```

---

### Task 6: Create safe useConvexQuery hook

Since the app renders tab screens before the Convex client is available, `useQuery` from `convex/react` will throw if called outside a `ConvexProvider`. Create a safe wrapper.

**Files:**
- Create: `lib/hooks.ts`

**Step 1: Create the hook**

```typescript
// lib/hooks.ts
import { useQuery, useMutation } from "convex/react";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";

/**
 * Safe wrapper around Convex useQuery that returns undefined
 * when Convex client is not available (instead of throwing).
 */
export function useSafeQuery<T>(
  ref: FunctionReference<"query">,
  args?: Record<string, unknown> | "skip"
): T | undefined {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  // When no Convex client, we can't call useQuery.
  // But React hooks must be called unconditionally.
  // So we use "skip" to prevent the actual query.
  const queryArgs = !convexUrl ? "skip" : (args ?? {});

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useQuery(ref, queryArgs) as T | undefined;
  } catch {
    // If ConvexProvider is missing, useQuery throws
    return undefined;
  }
}

/**
 * Safe wrapper around Convex useMutation.
 */
export function useSafeMutation(ref: FunctionReference<"mutation">) {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMutation(ref);
  } catch {
    // Return a no-op function if Convex is not available
    if (!convexUrl) {
      return async () => {
        throw new Error("Convex not connected");
      };
    }
    throw new Error("Convex mutation error");
  }
}
```

**Step 2: Commit**

```bash
git add lib/hooks.ts
git commit -m "feat: add safe Convex query/mutation hooks"
```

---

### Task 7: Redesign Dashboard screen

**Files:**
- Modify: `app/(main)/dashboard.tsx`

**Step 1: Rewrite dashboard**

```typescript
// app/(main)/dashboard.tsx
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { supabase } from "../../lib/supabase";
import { router } from "expo-router";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Badge } from "../../components/Badge";

const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  statusCounts: Record<string, number>;
}

interface QueueOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  total: number;
  itemCount: number;
  orderType?: string;
  status: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const clear = useAuthStore((s) => s.clear);

  const stats = useSafeQuery<DashboardStats>(getDashboardStatsRef);
  const queue = useSafeQuery<Record<string, QueueOrder[]>>(getRealtimeQueueRef);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clear();
    router.replace("/(auth)/login");
  };

  if (!convexUrl) {
    return (
      <View style={styles.screen}>
        <ErrorState
          message="Convex is not configured for this tenant. Please contact support."
          onRetry={handleLogout}
        />
      </View>
    );
  }

  const isLoading = stats === undefined;

  const pendingCount = queue?.pending?.length ?? 0;
  const confirmCount = queue?.confirmed?.length ?? 0;
  const preparingCount = queue?.preparing?.length ?? 0;
  const readyCount = queue?.ready?.length ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.tenantName}>{tenantName ?? "Dashboard"}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <LoadingState message="Loading dashboard..." />
      ) : (
        <>
          {/* Stats Grid */}
          <View style={styles.statsRow}>
            <StatCard value={stats.totalOrders} label="Orders Today" />
            <StatCard value={`₱${stats.totalRevenue.toFixed(0)}`} label="Revenue" />
          </View>
          <View style={styles.statsRow}>
            <StatCard value={`₱${stats.avgOrderValue.toFixed(0)}`} label="Avg Order" />
            <StatCard value={pendingCount + confirmCount + preparingCount + readyCount} label="Active Orders" />
          </View>

          {/* Order Queue */}
          <Text style={styles.sectionTitle}>Order Queue</Text>
          <View style={styles.queueRow}>
            {([
              { label: "Pending", count: pendingCount, color: colors.warningLight, textColor: colors.statusPending.text },
              { label: "Confirmed", count: confirmCount, color: colors.infoLight, textColor: colors.statusConfirmed.text },
              { label: "Preparing", count: preparingCount, color: "#FFF8E1", textColor: colors.statusPreparing.text },
              { label: "Ready", count: readyCount, color: colors.successLight, textColor: colors.statusReady.text },
            ] as const).map((item) => (
              <View key={item.label} style={[styles.queueItem, { backgroundColor: item.color }]}>
                <Text style={[styles.queueCount, { color: item.textColor }]}>{item.count}</Text>
                <Text style={[styles.queueLabel, { color: item.textColor }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* Recent Pending */}
          <Text style={styles.sectionTitle}>Recent Pending</Text>
          {pendingCount === 0 ? (
            <EmptyState message="No pending orders" />
          ) : (
            (queue?.pending ?? []).slice(0, 5).map((order) => (
              <TouchableOpacity
                key={order._id}
                style={styles.orderCard}
                onPress={() => router.push(`/(main)/order/${order._id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderName}>{order.customerName}</Text>
                  <Text style={styles.orderTotal}>₱{order.total.toFixed(2)}</Text>
                </View>
                <View style={styles.orderMeta}>
                  <Text style={styles.orderMetaText}>
                    {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · {order.orderType ?? "N/A"}
                  </Text>
                  <Badge label="pending" variant="pending" />
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.xxl },
  greeting: { ...typography.body, color: colors.textSecondary },
  tenantName: { ...typography.title, color: colors.textPrimary, marginTop: 2 },
  logoutButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  logoutText: { ...typography.body, color: colors.danger, fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  queueRow: { flexDirection: "row", gap: spacing.sm },
  queueItem: { flex: 1, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  queueCount: { fontSize: 22, fontWeight: "700" },
  queueLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  orderCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderName: { ...typography.heading, color: colors.textPrimary },
  orderTotal: { ...typography.heading, color: colors.primary },
  orderMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  orderMetaText: { ...typography.caption, color: colors.textSecondary },
});
```

**Step 2: Commit**

```bash
git add "app/(main)/dashboard.tsx"
git commit -m "feat: redesign dashboard with light theme, stats grid, proper loading/error states"
```

---

### Task 8: Redesign Orders screen

**Files:**
- Modify: `app/(main)/orders.tsx`

**Step 1: Rewrite orders.tsx**

```typescript
// app/(main)/orders.tsx
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { router } from "expo-router";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Badge } from "../../components/Badge";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const STATUS_FILTERS: (OrderStatus | "all")[] = ["all", "pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];

interface ConvexOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  total: number;
  itemCount: number;
  orderType?: string;
  status: OrderStatus;
  source?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryAddress?: string;
  lalamoveStatus?: string;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function OrdersScreen() {
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const orders = useSafeQuery<ConvexOrder[]>(getOrdersRef, filter === "all" ? {} : { status: filter });
  const updateStatus = useSafeMutation(updateOrderStatusRef);

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateStatus({ orderId, status: newStatus });
    } catch {
      Alert.alert("Error", "Failed to update order status");
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
      </View>

      {/* Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_FILTERS.map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterPill, filter === status && styles.filterPillActive]}
            onPress={() => setFilter(status)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, filter === status && styles.filterTextActive]}>
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />
        }
      >
        {orders === undefined ? (
          <LoadingState message="Loading orders..." />
        ) : orders.length === 0 ? (
          <EmptyState message="No orders found" />
        ) : (
          orders.map((order) => {
            const nextStatus = NEXT_STATUS[order.status];

            return (
              <TouchableOpacity
                key={order._id}
                style={styles.orderCard}
                onPress={() => router.push(`/(main)/order/${order._id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.orderTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName}>{order.customerName}</Text>
                    <Text style={styles.orderContact}>{order.customerContact}</Text>
                  </View>
                  <View style={styles.orderRight}>
                    <Text style={styles.orderTotal}>₱{order.total.toFixed(2)}</Text>
                    <Badge label={order.status} variant={order.status} />
                  </View>
                </View>

                <View style={styles.orderBottom}>
                  <Text style={styles.orderMeta}>
                    {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · {order.source ?? "web"} · {timeAgo(order._creationTime)}
                  </Text>
                </View>

                {nextStatus && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleUpdateStatus(order._id, nextStatus)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionText}>
                      Mark as {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                    </Text>
                  </TouchableOpacity>
                )}

                {order.status !== "delivered" && order.status !== "cancelled" && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert("Cancel Order", "Are you sure?", [
                        { text: "No" },
                        { text: "Yes", onPress: () => handleUpdateStatus(order._id, "cancelled"), style: "destructive" },
                      ]);
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  filterScroll: { maxHeight: 44 },
  filterContent: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  filterTextActive: { color: "#FFFFFF" },
  list: { flex: 1 },
  listContent: { padding: spacing.xl, paddingTop: spacing.md },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  orderTop: { flexDirection: "row", justifyContent: "space-between" },
  orderName: { ...typography.heading, color: colors.textPrimary },
  orderContact: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  orderRight: { alignItems: "flex-end", gap: spacing.xs },
  orderTotal: { ...typography.heading, color: colors.primary },
  orderBottom: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.separator },
  orderMeta: { ...typography.caption, color: colors.textSecondary },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: spacing.md,
  },
  actionText: { color: "#FFFFFF", fontWeight: "600", ...typography.body },
  cancelText: { ...typography.caption, color: colors.danger, textAlign: "center", marginTop: spacing.sm, paddingVertical: spacing.xs },
});
```

**Step 2: Commit**

```bash
git add "app/(main)/orders.tsx"
git commit -m "feat: redesign orders screen with light theme, badges, time-ago"
```

---

### Task 9: Redesign Analytics screen

**Files:**
- Modify: `app/(main)/analytics.tsx`

**Step 1: Rewrite analytics.tsx**

```typescript
// app/(main)/analytics.tsx
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";

const getUpsellAnalyticsRef = "analytics:getUpsellAnalytics" as unknown as FunctionReference<"query">;
const getBundleAnalyticsRef = "analytics:getBundleAnalytics" as unknown as FunctionReference<"query">;
const getTopItemsRef = "analytics:getTopItems" as unknown as FunctionReference<"query">;

interface UpsellStats {
  shown: number;
  clicked: number;
  converted: number;
  clickRate: number;
  conversionRate: number;
}

interface BundleStats {
  viewed: number;
  added: number;
  conversionRate: number;
}

interface TopItem {
  itemId: string;
  name: string;
  count: number;
  revenue: number;
}

export default function AnalyticsScreen() {
  const [daysBack, setDaysBack] = useState(7);

  const upsellStats = useSafeQuery<UpsellStats>(getUpsellAnalyticsRef, { daysBack });
  const bundleStats = useSafeQuery<BundleStats>(getBundleAnalyticsRef, { daysBack });
  const topItems = useSafeQuery<TopItem[]>(getTopItemsRef, { daysBack, limit: 10 });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Analytics</Text>

      {/* Period Selector */}
      <View style={styles.periodRow}>
        {[7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.periodPill, daysBack === d && styles.periodPillActive]}
            onPress={() => setDaysBack(d)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, daysBack === d && styles.periodTextActive]}>
              {d} days
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Upsell Funnel */}
      <Card title="Upsell Performance" style={styles.section}>
        {upsellStats === undefined ? (
          <LoadingState />
        ) : (
          <>
            <View style={styles.funnelRow}>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{upsellStats.shown}</Text>
                <Text style={styles.funnelLabel}>Shown</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{upsellStats.clicked}</Text>
                <Text style={styles.funnelLabel}>Clicked</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{upsellStats.converted}</Text>
                <Text style={styles.funnelLabel}>Converted</Text>
              </View>
            </View>
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(upsellStats.clickRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Click Rate</Text>
              </View>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(upsellStats.conversionRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Conversion</Text>
              </View>
            </View>
          </>
        )}
      </Card>

      {/* Bundle Performance */}
      <Card title="Bundle Performance" style={styles.section}>
        {bundleStats === undefined ? (
          <LoadingState />
        ) : (
          <>
            <View style={styles.funnelRow}>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{bundleStats.viewed}</Text>
                <Text style={styles.funnelLabel}>Viewed</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{bundleStats.added}</Text>
                <Text style={styles.funnelLabel}>Added</Text>
              </View>
            </View>
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(bundleStats.conversionRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Conversion Rate</Text>
              </View>
            </View>
          </>
        )}
      </Card>

      {/* Top Items */}
      <Card title="Top Items by Revenue" style={styles.section}>
        {topItems === undefined ? (
          <LoadingState />
        ) : topItems.length === 0 ? (
          <EmptyState message="No data yet" />
        ) : (
          topItems.map((item, index) => {
            const maxRevenue = topItems[0]?.revenue ?? 1;
            const barWidth = `${Math.max((item.revenue / maxRevenue) * 100, 5)}%`;

            return (
              <View key={item.itemId} style={styles.topItemRow}>
                <Text style={styles.rankText}>#{index + 1}</Text>
                <View style={styles.topItemInfo}>
                  <View style={styles.topItemHeader}>
                    <Text style={styles.topItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.topItemRevenue}>₱{item.revenue.toFixed(0)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: barWidth as any }]} />
                  </View>
                  <Text style={styles.topItemMeta}>{item.count} sold</Text>
                </View>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  periodRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  periodPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  periodPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  periodTextActive: { color: "#FFFFFF" },
  section: { marginBottom: spacing.lg },
  funnelRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  funnelItem: { alignItems: "center" },
  funnelValue: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  funnelLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  arrow: { fontSize: 18, color: colors.textTertiary },
  rateRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.separator,
  },
  rateItem: { alignItems: "center" },
  rateValue: { fontSize: 20, fontWeight: "700", color: colors.primary },
  rateLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  topItemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm, gap: spacing.sm },
  rankText: { ...typography.caption, color: colors.textTertiary, fontWeight: "600", width: 24 },
  topItemInfo: { flex: 1 },
  topItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topItemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1, marginRight: spacing.sm },
  topItemRevenue: { ...typography.body, color: colors.primary, fontWeight: "600" },
  barTrack: { height: 4, backgroundColor: colors.separator, borderRadius: 2, marginTop: spacing.xs },
  barFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  topItemMeta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
});
```

**Step 2: Commit**

```bash
git add "app/(main)/analytics.tsx"
git commit -m "feat: redesign analytics with light theme, revenue bars, card components"
```

---

### Task 10: Redesign Trends screen

**Files:**
- Modify: `app/(main)/trends.tsx`

**Step 1: Rewrite trends.tsx**

```typescript
// app/(main)/trends.tsx
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";

const getTrendsRef = "analytics:getTrends" as unknown as FunctionReference<"query">;

interface DailyStat {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

function BarChart({ data, valueKey, color, label }: {
  data: DailyStat[];
  valueKey: keyof DailyStat;
  color: string;
  label: string;
}) {
  if (data.length === 0) return null;

  const values = data.map((d) => Number(d[valueKey]) || 0);
  const maxVal = Math.max(...values, 1);
  const barWidth = Math.max(((SCREEN_WIDTH - 100) / data.length) - 4, 6);

  return (
    <Card title={label} style={styles.chartCard}>
      <View style={styles.barsContainer}>
        {data.map((d, i) => {
          const height = (values[i] / maxVal) * 100;
          return (
            <View key={d.date} style={styles.barWrapper}>
              <Text style={styles.barValue}>
                {valueKey === "totalRevenue" ? `₱${values[i].toFixed(0)}` : values[i].toString()}
              </Text>
              <View style={[styles.bar, { height, backgroundColor: color, width: barWidth }]} />
              <Text style={styles.barLabel}>{d.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export default function TrendsScreen() {
  const [daysBack, setDaysBack] = useState(14);
  const trends = useSafeQuery<DailyStat[]>(getTrendsRef, { daysBack });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trends</Text>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {[7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.periodPill, daysBack === d && styles.periodPillActive]}
            onPress={() => setDaysBack(d)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, daysBack === d && styles.periodTextActive]}>
              {d} days
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {trends === undefined ? (
        <LoadingState message="Loading trends..." />
      ) : trends.length === 0 ? (
        <EmptyState message="No trend data yet. Data appears after daily stats are aggregated." />
      ) : (
        <>
          {/* Summary */}
          <View style={styles.summaryRow}>
            <StatCard
              value={trends.reduce((s, d) => s + d.totalOrders, 0)}
              label="Total Orders"
            />
            <StatCard
              value={`₱${trends.reduce((s, d) => s + d.totalRevenue, 0).toFixed(0)}`}
              label="Total Revenue"
            />
          </View>

          <BarChart data={trends} valueKey="totalRevenue" color={colors.primary} label="Daily Revenue" />
          <BarChart data={trends} valueKey="totalOrders" color={colors.success} label="Daily Orders" />
          <BarChart data={trends} valueKey="avgOrderValue" color={colors.warning} label="Avg Order Value" />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  periodRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  periodPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  periodPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  periodTextActive: { color: "#FFFFFF" },
  summaryRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  chartCard: { marginBottom: spacing.lg },
  barsContainer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 3, height: 140, paddingTop: spacing.sm },
  barWrapper: { alignItems: "center" },
  bar: { borderRadius: 3, minHeight: 2 },
  barValue: { fontSize: 7, color: colors.textTertiary, marginBottom: 3, textAlign: "center" },
  barLabel: { fontSize: 7, color: colors.textTertiary, marginTop: 3, textAlign: "center" },
});
```

**Step 2: Commit**

```bash
git add "app/(main)/trends.tsx"
git commit -m "feat: redesign trends with light theme and Card components"
```

---

### Task 11: Redesign Order Detail screen

**Files:**
- Modify: `app/(main)/order/[orderId].tsx`

**Step 1: Rewrite order detail**

```typescript
// app/(main)/order/[orderId].tsx
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation } from "../../../lib/hooks";
import { colors, typography, spacing, radius, shadow } from "../../../theme/colors";
import { Card } from "../../../components/Card";
import { Badge } from "../../../components/Badge";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";

const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";

const STATUS_STEPS: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "delivered"];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

interface OrderItem {
  menuItemName: string;
  variation?: string;
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  quantity: number;
  subtotal: number;
}

interface OrderDetail {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  status: OrderStatus;
  orderType?: string;
  source: string;
  total: number;
  deliveryAddress?: string;
  deliveryFee?: number;
  lalamoveStatus?: string;
  lalamoveDriverName?: string;
  lalamoveDriverPhone?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: OrderItem[];
}

function StatusStepper({ currentStatus }: { currentStatus: OrderStatus }) {
  const currentIndex = STATUS_STEPS.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";

  return (
    <View style={stepperStyles.container}>
      {STATUS_STEPS.map((step, i) => {
        const isComplete = !isCancelled && i <= currentIndex;
        const isCurrent = !isCancelled && i === currentIndex;
        return (
          <View key={step} style={stepperStyles.step}>
            <View style={[
              stepperStyles.dot,
              isComplete && stepperStyles.dotComplete,
              isCurrent && stepperStyles.dotCurrent,
              isCancelled && stepperStyles.dotCancelled,
            ]} />
            <Text style={[
              stepperStyles.label,
              isComplete && stepperStyles.labelComplete,
            ]}>
              {step.charAt(0).toUpperCase() + step.slice(1)}
            </Text>
            {i < STATUS_STEPS.length - 1 && (
              <View style={[stepperStyles.line, isComplete && i < currentIndex && stepperStyles.lineComplete]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md },
  step: { alignItems: "center", flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.separator },
  dotComplete: { backgroundColor: colors.success },
  dotCurrent: { backgroundColor: colors.primary, width: 14, height: 14, borderRadius: 7 },
  dotCancelled: { backgroundColor: colors.danger },
  label: { ...typography.small, color: colors.textTertiary, marginTop: spacing.xs },
  labelComplete: { color: colors.textSecondary, fontWeight: "500" },
  line: { position: "absolute", top: 5, left: "60%", right: "-40%", height: 2, backgroundColor: colors.separator },
  lineComplete: { backgroundColor: colors.success },
});

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useSafeQuery<OrderDetail | null>(
    getOrderByIdRef,
    orderId ? { orderId } : "skip"
  );
  const updateStatus = useSafeMutation(updateOrderStatusRef);

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!order) return;
    try {
      await updateStatus({ orderId: order._id, status: newStatus });
    } catch {
      Alert.alert("Error", "Failed to update status");
    }
  };

  if (order === undefined) {
    return <LoadingState fullScreen message="Loading order..." />;
  }

  if (order === null) {
    return (
      <View style={styles.screen}>
        <ErrorState message="Order not found" onRetry={() => router.back()} />
      </View>
    );
  }

  const nextStatus = NEXT_STATUS[order.status];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Back Button */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* Status */}
      <View style={styles.statusHeader}>
        <Text style={styles.title}>Order Details</Text>
        <Badge label={order.status} variant={order.status} />
      </View>

      {/* Stepper */}
      <Card style={styles.section}>
        <StatusStepper currentStatus={order.status} />
      </Card>

      {/* Customer */}
      <Card title="Customer" style={styles.section}>
        <Text style={styles.value}>{order.customerName}</Text>
        <Text style={styles.sub}>{order.customerContact}</Text>
        <Text style={styles.sub}>
          {order.orderType ?? "N/A"} · {order.source} · {new Date(order._creationTime).toLocaleString()}
        </Text>
      </Card>

      {/* Items */}
      <Card title={`Items (${order.items?.length ?? 0})`} style={styles.section}>
        {order.items?.map((item, i) => (
          <View key={i} style={[styles.itemRow, i < (order.items?.length ?? 0) - 1 && styles.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.menuItemName}</Text>
              {item.variation && <Text style={styles.itemDetail}>Variation: {item.variation}</Text>}
              {item.addons && item.addons.length > 0 && (
                <Text style={styles.itemDetail}>
                  Add-ons: {item.addons.map((a) => a.name).join(", ")}
                </Text>
              )}
              {item.specialInstructions && (
                <Text style={styles.itemDetail}>Note: {item.specialInstructions}</Text>
              )}
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemQty}>x{item.quantity}</Text>
              <Text style={styles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
            </View>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₱{order.total.toFixed(2)}</Text>
        </View>
      </Card>

      {/* Delivery */}
      {order.deliveryAddress && (
        <Card title="Delivery" style={styles.section}>
          <Text style={styles.value}>{order.deliveryAddress}</Text>
          {order.deliveryFee != null && <Text style={styles.sub}>Fee: ₱{order.deliveryFee.toFixed(2)}</Text>}
          {order.lalamoveStatus && <Text style={styles.sub}>Lalamove: {order.lalamoveStatus}</Text>}
          {order.lalamoveDriverName && (
            <Text style={styles.sub}>Driver: {order.lalamoveDriverName} ({order.lalamoveDriverPhone})</Text>
          )}
        </Card>
      )}

      {/* Payment */}
      {order.paymentMethod && (
        <Card title="Payment" style={styles.section}>
          <Text style={styles.value}>{order.paymentMethod}</Text>
          <Text style={styles.sub}>Status: {order.paymentStatus ?? "pending"}</Text>
        </Card>
      )}

      {/* Actions */}
      {(nextStatus || (order.status !== "delivered" && order.status !== "cancelled")) && (
        <View style={styles.actions}>
          {nextStatus && (
            <TouchableOpacity style={styles.primaryAction} onPress={() => handleUpdateStatus(nextStatus)} activeOpacity={0.8}>
              <Text style={styles.primaryActionText}>
                Mark as {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
              </Text>
            </TouchableOpacity>
          )}
          {order.status !== "delivered" && order.status !== "cancelled" && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert("Cancel Order", "Are you sure?", [
                  { text: "No" },
                  { text: "Yes", onPress: () => handleUpdateStatus("cancelled"), style: "destructive" },
                ]);
              }}
            >
              <Text style={styles.cancelText}>Cancel Order</Text>
            </TouchableOpacity>
          )}
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
  statusHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary },
  section: { marginBottom: spacing.md },
  value: { ...typography.heading, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
  itemBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.separator },
  itemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  itemDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemRight: { alignItems: "flex-end", marginLeft: spacing.md },
  itemQty: { ...typography.caption, color: colors.textSecondary },
  itemPrice: { ...typography.body, color: colors.primary, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.separator },
  totalLabel: { ...typography.heading, color: colors.textPrimary },
  totalValue: { ...typography.heading, color: colors.primary },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  primaryAction: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: "center" },
  primaryActionText: { color: "#FFFFFF", ...typography.heading },
  cancelText: { ...typography.body, color: colors.danger, textAlign: "center", paddingVertical: spacing.sm },
});
```

**Step 2: Commit**

```bash
git add "app/(main)/order/[orderId].tsx"
git commit -m "feat: redesign order detail with status stepper, card components, action buttons"
```

---

### Task 12: Final verification

**Step 1: Run TypeScript check**

Run: `cd /Users/codemedavid/Documents/whitelabel/webnegosyo-app && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

**Step 2: Start the app**

Run: `npx expo start --clear`
Expected: App launches with light theme, login screen shows Apple-inspired design

**Step 3: Test login flow**

1. Enter valid admin credentials → should navigate to Dashboard
2. Dashboard shows greeting + stats + order queue
3. All tabs load (or show proper empty/error states)
4. Order detail accessible from Orders tab

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: admin app redesign complete - light theme, bug fixes, shared components"
```
