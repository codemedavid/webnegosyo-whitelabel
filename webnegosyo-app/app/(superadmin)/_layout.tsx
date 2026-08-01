import { useEffect } from "react";
import { Tabs, router, type ErrorBoundaryProps } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../theme/colors";
import { CrashFallback } from "../../components/CrashFallback";
import { useAuthStore } from "../../stores/auth-store";
import { supabase } from "../../lib/supabase";
import { getSuperadminTab } from "../../lib/superadmin-nav";

/**
 * Error Boundary scoped to the platform (superadmin) tab tree, mirroring the
 * merchant tree's boundary: a render throw degrades to a recoverable screen
 * instead of force-closing the app.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // No session — ignore.
    }
    useAuthStore.getState().clear();
    router.replace("/(auth)/login");
  };
  return (
    <CrashFallback
      error={error}
      onRetry={() => {
        void retry();
      }}
      onSignOut={handleSignOut}
    />
  );
}

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{symbol}</Text>;
}

/** Label and icon pulled from the registry, so the two cannot drift apart. */
function tabOptions(name: string) {
  const tab = getSuperadminTab(name);
  return {
    tabBarLabel: tab?.label ?? name,
    tabBarIcon: ({ color }: { color: string }) => (
      <TabIcon symbol={tab?.icon ?? "•"} color={color} />
    ),
  };
}

export default function SuperadminLayout() {
  // Hard role gate. Only a session whose app_users.role is 'superadmin' may
  // render this surface; merchants, restricted staff and the read-only demo
  // session are sent back to the merchant tree.
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    // The store starts as { isLoading: true, isSuperadmin: false }, so gating
    // on the role alone fires this redirect during cold start — before auth has
    // resolved. The root redirect then sends the session straight back here,
    // remounting the Tabs navigator below while its nested params are already
    // marked consumed; react-navigation then rehydrates from undefined state
    // and throws "Cannot read property 'stale' of undefined".
    if (isLoading) return;
    if (!isSuperadmin) router.replace("/(main)/dashboard");
  }, [isSuperadmin, isLoading]);

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
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      {/* Declared explicitly (not mapped) so each route name is greppable and
          the nav guardrail test can verify the registry matches the layout. */}
      <Tabs.Screen name="dashboard" options={tabOptions("dashboard")} />
      <Tabs.Screen name="tenants" options={tabOptions("tenants")} />
      <Tabs.Screen name="leads" options={tabOptions("leads")} />
      <Tabs.Screen name="settings" options={tabOptions("settings")} />
      {/* Detail screens — reachable by push, never tabs. */}
      <Tabs.Screen
        name="tenant/[id]"
        options={{ href: null, title: "Restaurant" }}
      />
      <Tabs.Screen name="lead/[id]" options={{ href: null, title: "Lead" }} />
    </Tabs>
  );
}
