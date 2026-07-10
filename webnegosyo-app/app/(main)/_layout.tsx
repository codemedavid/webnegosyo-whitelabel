import { Tabs, router, type ErrorBoundaryProps } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../theme/colors";
import { CrashFallback } from "../../components/CrashFallback";
import { useAuthStore } from "../../stores/auth-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { isTabInWorkspace } from "../../lib/workspaces";
import { isTabAllowed } from "../../lib/staff-permissions";
import { supabase } from "../../lib/supabase";
import { GlobalOrderAlerts } from "../../components/GlobalOrderAlerts";

/**
 * Error Boundary scoped to the main (post-login) tab tree. A render throw in any
 * tab degrades to this screen instead of force-closing the app. expo-router
 * wraps this route segment with this same-file export.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // No session (e.g. demo) — ignore.
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

export default function MainLayout() {
  // The app is split into focused views (Operations / Insights / Products).
  // Only the active view's tabs are visible; the rest keep href: null so
  // their routes still exist for direct navigation (e.g. order detail push).
  // Restricted staff additionally only see tabs they hold permission for.
  const workspace = useWorkspaceStore((s) => s.workspace);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const caller = { role, isOwner, permissions };
  const show = (tab: string) =>
    isTabInWorkspace(tab, workspace) && isTabAllowed(caller, tab)
      ? undefined
      : null;

  return (
    <>
      {/* App-wide new-order ringtone — active on every tab, not just Dashboard. */}
      <GlobalOrderAlerts />
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
      {/* Operations view */}
      <Tabs.Screen
        name="dashboard"
        options={{
          href: show("dashboard"),
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => <TabIcon symbol="⊞" color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          href: show("orders"),
          tabBarLabel: "Orders",
          tabBarIcon: ({ color }) => <TabIcon symbol="☰" color={color} />,
        }}
      />
      {/* Insights view */}
      <Tabs.Screen
        name="analytics"
        options={{
          href: show("analytics"),
          tabBarLabel: "Analytics",
          tabBarIcon: ({ color }) => <TabIcon symbol="◔" color={color} />,
        }}
      />
      <Tabs.Screen
        name="growth"
        options={{
          href: show("growth"),
          tabBarLabel: "Growth",
          tabBarIcon: ({ color }) => <TabIcon symbol="⇗" color={color} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          href: show("trends"),
          tabBarLabel: "Trends",
          tabBarIcon: ({ color }) => <TabIcon symbol="⬈" color={color} />,
        }}
      />
      {/* Products view */}
      <Tabs.Screen
        name="product-analytics"
        options={{
          href: show("product-analytics"),
          tabBarLabel: "Performance",
          tabBarIcon: ({ color }) => <TabIcon symbol="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="product-management"
        options={{
          href: show("product-management"),
          title: "Manage Products",
          tabBarLabel: "Manage",
          tabBarIcon: ({ color }) => <TabIcon symbol="✎" color={color} />,
        }}
      />
      {/* Detail/utility screens — never tabs */}
      <Tabs.Screen
        name="product/[productId]"
        options={{ href: null, title: "Product" }}
      />
      <Tabs.Screen
        name="scan"
        options={{ href: null, title: "Scan QR" }}
      />
      <Tabs.Screen
        name="order/[orderId]"
        options={{ href: null, title: "Order Detail" }}
      />
      <Tabs.Screen
        name="printer-settings"
        options={{ href: null, title: "Printer Settings" }}
      />
      <Tabs.Screen
        name="account"
        options={{ href: null, title: "Account" }}
      />
      </Tabs>
    </>
  );
}
