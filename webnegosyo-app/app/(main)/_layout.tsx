import { useMemo } from "react";
import { Tabs, router, type ErrorBoundaryProps } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/colors";
import { TabIcon } from "../../components/Icon";
import { CrashFallback } from "../../components/CrashFallback";
import { useAuthStore } from "../../stores/auth-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { isTabOnBar } from "../../lib/tab-visibility";
import { tabLabel } from "../../lib/workspace-presentation";
import { useAdvanceOrdering } from "../../lib/use-advance-ordering";
import { activeWorkspace } from "../../lib/portfolio-landing";
import { usePortfolioAudience } from "../../lib/use-portfolio-audience";
import { supabase } from "../../lib/supabase";
import { GlobalOrderAlerts } from "../../components/GlobalOrderAlerts";
import { GlobalKitchenAutoPrint } from "../../components/GlobalKitchenAutoPrint";
import { GlobalReceiptAutoPrint } from "../../components/GlobalReceiptAutoPrint";
import { PrinterWarmUp } from "../../components/PrinterWarmUp";
import { GlobalLoyaltySmsDelivery } from "../../components/GlobalLoyaltySmsDelivery";
import { ImpersonationBanner } from "../../components/ImpersonationBanner";
import { BranchContextBar } from "../../components/BranchContextBar";
import { WhatsNewPopup } from "../../components/WhatsNewPopup";
import { TutorialWelcomePopup } from "../../components/tutorial/TutorialWelcomePopup";
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

/** Icon + label rows of the bar, before the home-indicator inset is added. */
const TAB_BAR_CONTENT_HEIGHT = 56;

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
  // Memoised: these objects feed every `show()` below and are the identity
  // the tab tree's options are compared on.
  const caller = useMemo(() => ({ role, isOwner, permissions }), [role, isOwner, permissions]);
  const audience = usePortfolioAudience();
  // The stored view can outlive the right to see it, so it is resolved against
  // what this account may actually see — otherwise a persisted "business"
  // leaves a branch manager with an empty tab bar.
  const workspace = activeWorkspace(storedWorkspace, caller, audience);
  // The Scheduled tab exists only for stores that take pre-orders at all —
  // gated on config rather than data so it never flickers with the order list.
  const takesAdvanceOrders = useAdvanceOrdering();
  // Four gates, answered in one place (lib/tab-visibility.ts) so the Menu hub
  // lists exactly the screens the bar would show: the active view owns the
  // tab, the account's staff grants permit it, the Business tabs need a store
  // that runs several branches, and Scheduled needs a store that takes
  // pre-orders. A registered tab is reachable even when the switcher never
  // named its view, so every rule has to be asked here, not just in the
  // switcher. The Menu hub itself is always on the bar.
  const ctx = useMemo(
    () => ({ caller, audience, takesAdvanceOrders }),
    [caller, audience, takesAdvanceOrders],
  );
  const show = (tab: string) => (isTabOnBar(tab, workspace, ctx) ? undefined : null);
  // The bar sits on the home-indicator inset rather than a fixed 85pt guess
  // that was too tall on Android and too short on some iPhones.
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, spacing.sm);

  return (
    <>
      {/* App-wide new-order ringtone — active on every tab, not just Dashboard. */}
      <GlobalOrderAlerts />
      {/* Auto-prints kitchen chits on new orders, whichever tab is open. */}
      <GlobalKitchenAutoPrint />
      {/* Prints the cashier receipt when an order is confirmed, from any screen. */}
      <GlobalReceiptAutoPrint />
      <PrinterWarmUp />
      {/* Delivers loyalty OTPs from an enrolled Android handset; gated, Android-only. */}
      <GlobalLoyaltySmsDelivery />
      {/* Renders only while a superadmin is viewing another store. */}
      <ImpersonationBanner />
      {/* Renders only when the visible orders are one branch's, not the store's. */}
      <BranchContextBar />
      {/* Greets a signed-in merchant with the newest unread platform post. */}
      <WhatsNewPopup />
      {/* Offers a first-time merchant the guided tour, once per account. */}
      <TutorialWelcomePopup />
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 0.5,
          height: tabBarHeight,
          paddingTop: spacing.sm,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      {/* Operations view */}
      <Tabs.Screen
        name="dashboard"
        options={{
          href: show("dashboard"),
          tabBarLabel: tabLabel("dashboard"),
          tabBarIcon: ({ color }) => <TabIcon name="dashboard" color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          href: show("orders"),
          tabBarLabel: tabLabel("orders"),
          tabBarIcon: ({ color }) => <TabIcon name="orders" color={color} />,
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          href: show("kitchen"),
          tabBarLabel: tabLabel("kitchen"),
          tabBarIcon: ({ color }) => <TabIcon name="kitchen" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scheduled"
        options={{
          href: show("scheduled"),
          tabBarLabel: tabLabel("scheduled"),
          tabBarIcon: ({ color }) => <TabIcon name="calendar" color={color} />,
        }}
      />
      {/* Register view */}
      <Tabs.Screen
        name="pos"
        options={{
          href: show("pos"),
          tabBarLabel: tabLabel("pos"),
          tabBarIcon: ({ color }) => <TabIcon name="register" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pos-sales"
        options={{
          href: show("pos-sales"),
          tabBarLabel: tabLabel("pos-sales"),
          tabBarIcon: ({ color }) => <TabIcon name="drawer" color={color} />,
        }}
      />
      {/* Insights view */}
      <Tabs.Screen
        name="analytics"
        options={{
          href: show("analytics"),
          tabBarLabel: tabLabel("analytics"),
          tabBarIcon: ({ color }) => <TabIcon name="analytics" color={color} />,
        }}
      />
      <Tabs.Screen
        name="growth"
        options={{
          href: show("growth"),
          tabBarLabel: tabLabel("growth"),
          tabBarIcon: ({ color }) => <TabIcon name="growth" color={color} />,
        }}
      />
      <Tabs.Screen
        name="customer-hub"
        options={{
          href: show("customer-hub"),
          title: "Customers",
          tabBarLabel: tabLabel("customer-hub"),
          tabBarIcon: ({ color }) => <TabIcon name="customers" color={color} />,
        }}
      />
      <Tabs.Screen
        name="loyalty"
        options={{
          href: show("loyalty"),
          title: "Rewards",
          tabBarLabel: tabLabel("loyalty"),
          tabBarIcon: ({ color }) => <TabIcon name="check" color={color} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          href: show("customers"),
          title: "Customers",
          tabBarLabel: tabLabel("customers"),
          tabBarIcon: ({ color }) => <TabIcon name="customers" color={color} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          href: show("trends"),
          tabBarLabel: tabLabel("trends"),
          tabBarIcon: ({ color }) => <TabIcon name="trends" color={color} />,
        }}
      />
      {/* Products view */}
      <Tabs.Screen
        name="product-analytics"
        options={{
          href: show("product-analytics"),
          tabBarLabel: tabLabel("product-analytics"),
          tabBarIcon: ({ color }) => <TabIcon name="performance" color={color} />,
        }}
      />
      <Tabs.Screen
        name="product-management"
        options={{
          href: show("product-management"),
          title: "Manage Products",
          tabBarLabel: tabLabel("product-management"),
          tabBarIcon: ({ color }) => <TabIcon name="manage" color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          href: show("inventory"),
          title: "Inventory",
          tabBarLabel: tabLabel("inventory"),
          tabBarIcon: ({ color }) => <TabIcon name="stock" color={color} />,
        }}
      />
      <Tabs.Screen
        name="daily-report"
        options={{
          href: show("daily-report"),
          title: "Daily Report",
          tabBarLabel: tabLabel("daily-report"),
          tabBarIcon: ({ color }) => <TabIcon name="report" color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          href: show("payments"),
          title: "Payment Methods",
          tabBarLabel: tabLabel("payments"),
          tabBarIcon: ({ color }) => <TabIcon name="payments" color={color} />,
        }}
      />
      {/* Business view */}
      <Tabs.Screen
        name="portfolio"
        options={{
          href: show("portfolio"),
          title: "Your business",
          tabBarLabel: tabLabel("portfolio"),
          tabBarIcon: ({ color }) => <TabIcon name="storefront" color={color} />,
        }}
      />
      <Tabs.Screen
        name="branches"
        options={{
          href: show("branches"),
          title: "Branch performance",
          tabBarLabel: tabLabel("branches"),
          tabBarIcon: ({ color }) => <TabIcon name="compare" color={color} />,
        }}
      />
      <Tabs.Screen
        name="branch-menu"
        options={{
          href: show("branch-menu"),
          title: "Branch products",
          tabBarLabel: tabLabel("branch-menu"),
          tabBarIcon: ({ color }) => <TabIcon name="list" color={color} />,
        }}
      />
      {/* Always on the bar, whatever the view: the map of the whole app. */}
      <Tabs.Screen
        name="menu"
        options={{
          href: show("menu"),
          tabBarLabel: tabLabel("menu"),
          tabBarIcon: ({ color }) => <TabIcon name="menu" color={color} />,
        }}
      />
      {/* Detail/utility screens — never tabs */}
      <Tabs.Screen
        name="product/[productId]"
        options={{ href: null, title: "Product" }}
      />
      <Tabs.Screen
        name="product/recipe/[productId]"
        options={{ href: null, title: "Recipe" }}
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
      <Tabs.Screen
        name="team"
        options={{ href: null, title: "Team" }}
      />
      {/* Platform "What's New" inbox + post — reached from Account or a push, never a tab. */}
      <Tabs.Screen
        name="whats-new/index"
        options={{ href: null, title: "What's New" }}
      />
      <Tabs.Screen
        name="whats-new/[announcementId]"
        options={{ href: null, title: "Update" }}
      />
      {/* Guided tour: the chapter list and one chapter — reached from the greeter, Menu, or Account. */}
      <Tabs.Screen
        name="tutorial/index"
        options={{ href: null, title: "Learn the app" }}
      />
      {/* The chapter draws its own bar inside the simulation, so the real one hides. */}
      <Tabs.Screen
        name="tutorial/[chapterId]"
        options={{ href: null, title: "Chapter", tabBarStyle: { display: "none" } }}
      />
      </Tabs>
    </>
  );
}
