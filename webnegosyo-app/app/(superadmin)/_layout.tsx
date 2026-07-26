import { useEffect } from "react";
import { Tabs, router, type ErrorBoundaryProps } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../theme/colors";
import { CrashFallback } from "../../components/CrashFallback";
import { useAuthStore } from "../../stores/auth-store";
import { supabase } from "../../lib/supabase";
import { SUPERADMIN_TABS } from "../../lib/superadmin-nav";

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

export default function SuperadminLayout() {
  // Hard role gate. Only a session whose app_users.role is 'superadmin' may
  // render this surface; merchants, restricted staff and the read-only demo
  // session are sent back to the merchant tree.
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);

  useEffect(() => {
    if (!isSuperadmin) router.replace("/(main)/dashboard");
  }, [isSuperadmin]);

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
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: SUPERADMIN_TABS[0].label,
          tabBarIcon: ({ color }) => (
            <TabIcon symbol={SUPERADMIN_TABS[0].icon} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tenants"
        options={{
          tabBarLabel: SUPERADMIN_TABS[1].label,
          tabBarIcon: ({ color }) => (
            <TabIcon symbol={SUPERADMIN_TABS[1].icon} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: SUPERADMIN_TABS[2].label,
          tabBarIcon: ({ color }) => (
            <TabIcon symbol={SUPERADMIN_TABS[2].icon} color={color} />
          ),
        }}
      />
      {/* Detail screens — reachable by push, never tabs. */}
      <Tabs.Screen
        name="tenant/[id]"
        options={{ href: null, title: "Restaurant" }}
      />
    </Tabs>
  );
}
