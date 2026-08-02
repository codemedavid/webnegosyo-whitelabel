import { Tabs, router, type ErrorBoundaryProps } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../theme/colors";
import { CrashFallback } from "../../components/CrashFallback";
import { useAuthStore } from "../../stores/auth-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { isTabInWorkspace } from "../../lib/workspaces";
import { isTabAllowed } from "../../lib/staff-permissions";
import { activeWorkspace, isBusinessTabVisible } from "../../lib/portfolio-landing";
import { usePortfolioAudience } from "../../lib/use-portfolio-audience";
import { supabase } from "../../lib/supabase";
import { GlobalOrderAlerts } from "../../components/GlobalOrderAlerts";
import { ImpersonationBanner } from "../../components/ImpersonationBanner";
import { BranchContextBar } from "../../components/BranchContextBar";
import { useBranchLanding } from "../../lib/use-branch-landing";

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
  // Opens a multi-branch owner on the portfolio, and loads the branch list the
  // context rules validate selections against.
  useBranchLanding();

  const storedWorkspace = useWorkspaceStore((s) => s.workspace);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const caller = { role, isOwner, permissions };
  const audience = usePortfolioAudience();
  // The stored view can outlive the right to see it, so it is resolved against
  // what this account may actually see — otherwise a persisted "business"
  // leaves a branch manager with an empty tab bar.
  const workspace = activeWorkspace(storedWorkspace, caller, audience);
  // Three gates: the active view owns the tab, the account's staff grants
  // permit it, and — for the Business tabs — the account runs the store rather
  // than one branch. A registered tab is reachable even when the switcher
  // never named its view, so the branch rule has to be asked here too.
  const show = (tab: string) =>
    isTabInWorkspace(tab, workspace) &&
    isTabAllowed(caller, tab) &&
    isBusinessTabVisible(tab, audience)
      ? undefined
      : null;

  return (
    <>
      {/* App-wide new-order ringtone — active on every tab, not just Dashboard. */}
      <GlobalOrderAlerts />
      {/* Renders only while a superadmin is viewing another store. */}
      <ImpersonationBanner />
      {/* Renders only when the visible orders are one branch's, not the store's. */}
      <BranchContextBar />
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
      {/* Register view */}
      <Tabs.Screen
        name="pos"
        options={{
          href: show("pos"),
          tabBarLabel: "Register",
          tabBarIcon: ({ color }) => <TabIcon symbol="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pos-sales"
        options={{
          href: show("pos-sales"),
          tabBarLabel: "Drawer",
          tabBarIcon: ({ color }) => <TabIcon symbol="◫" color={color} />,
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
        name="customers"
        options={{
          href: show("customers"),
          title: "Customers",
          tabBarLabel: "Customers",
          tabBarIcon: ({ color }) => <TabIcon symbol="☺" color={color} />,
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
      <Tabs.Screen
        name="inventory"
        options={{
          href: show("inventory"),
          title: "Inventory",
          tabBarLabel: "Stock",
          tabBarIcon: ({ color }) => <TabIcon symbol="◫" color={color} />,
        }}
      />
      <Tabs.Screen
        name="daily-report"
        options={{
          href: show("daily-report"),
          title: "Daily Report",
          tabBarLabel: "Report",
          tabBarIcon: ({ color }) => <TabIcon symbol="◷" color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          href: show("payments"),
          title: "Payment Methods",
          tabBarLabel: "Payments",
          tabBarIcon: ({ color }) => <TabIcon symbol="₱" color={color} />,
        }}
      />
      {/* Business view */}
      <Tabs.Screen
        name="portfolio"
        options={{
          href: show("portfolio"),
          title: "Your business",
          tabBarLabel: "Branches",
          tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="branches"
        options={{
          href: show("branches"),
          title: "Branch performance",
          tabBarLabel: "Compare",
          tabBarIcon: ({ color }) => <TabIcon symbol="⇅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="branch-menu"
        options={{
          href: show("branch-menu"),
          title: "Branch products",
          tabBarLabel: "Products",
          tabBarIcon: ({ color }) => <TabIcon symbol="☰" color={color} />,
        }}
      />
      {/* Detail/utility screens — never tabs */}
      <Tabs.Screen
        name="product/[productId]"
        options={{ href: null, title: "Product" }}
      />
      <Tabs.Screen
        name="payment/[methodId]"
        options={{ href: null, title: "Payment Method" }}
      />
      {/* Routable detail screen, never a tab — href: null keeps it off the bar. */}
      <Tabs.Screen
        name="campaign/[campaignId]"
        options={{ href: null, title: "Campaign" }}
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
        name="pos-tender"
        options={{ href: null, title: "Take Payment" }}
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
