import { Tabs, router, type ErrorBoundaryProps } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/colors";
import { TabIcon } from "../../components/Icon";
import { CrashFallback } from "../../components/CrashFallback";
import { useAuthStore } from "../../stores/auth-store";
import { isTabOnBar } from "../../lib/tab-visibility";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { tabLabel } from "../../lib/workspace-presentation";
import { supabase } from "../../lib/supabase";
import { signOutThisDevice } from "../../lib/sign-out";
import { GlobalOrderAlerts } from "../../components/GlobalOrderAlerts";
import { GlobalKitchenAutoPrint } from "../../components/GlobalKitchenAutoPrint";
import { GlobalReceiptAutoPrint } from "../../components/GlobalReceiptAutoPrint";
import { PrinterWarmUp } from "../../components/PrinterWarmUp";
import { OfflineSalesSync } from "../../components/OfflineSalesSync";
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
      await signOutThisDevice(supabase);
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
  // One bar, five slots, never re-shaped: Home · Orders · POS · Reports ·
  // Manage. Every other screen is registered here with href: null so its
  // route exists for pushes and deep links, and is reached from the tab it
  // hangs under (lib/subscreen-links.ts) or from one of the two hubs
  // (lib/hubs.ts). Which slots this account gets — and whether Kitchen takes
  // the Orders slot for a cook — is answered once, in lib/tab-visibility.ts.
  //
  // Opens an account on its pinned screen, and loads the branch list the
  // context rules validate selections against.
  useBranchLanding();

  const ctx = useTabVisibilityContext();
  const show = (tab: string) => (isTabOnBar(tab, ctx) ? undefined : null);
  // The bar sits on the home-indicator inset rather than a fixed 85pt guess
  // that was too tall on Android and too short on some iPhones.
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, spacing.sm);

  return (
    <>
      {/* App-wide new-order ringtone — active on every tab, not just Home. */}
      <GlobalOrderAlerts />
      {/* Auto-prints kitchen chits on new orders, whichever tab is open. */}
      <GlobalKitchenAutoPrint />
      {/* Prints the cashier receipt when an order is confirmed, from any screen. */}
      <GlobalReceiptAutoPrint />
      <PrinterWarmUp />
      {/* Watches the connection and replays counter sales taken offline. */}
      <OfflineSalesSync />
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
        {/* ── The bar ─────────────────────────────────────────────────── */}
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
        {/* Takes the Orders slot for an account that holds only the kitchen grant. */}
        <Tabs.Screen
          name="kitchen"
          options={{
            href: show("kitchen"),
            tabBarLabel: tabLabel("kitchen"),
            tabBarIcon: ({ color }) => <TabIcon name="kitchen" color={color} />,
          }}
        />
        <Tabs.Screen
          name="pos"
          options={{
            href: show("pos"),
            tabBarLabel: tabLabel("pos"),
            tabBarIcon: ({ color }) => <TabIcon name="register" color={color} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            href: show("reports"),
            tabBarLabel: tabLabel("reports"),
            tabBarIcon: ({ color }) => <TabIcon name="trends" color={color} />,
          }}
        />
        <Tabs.Screen
          name="menu"
          options={{
            href: show("menu"),
            tabBarLabel: tabLabel("menu"),
            tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
          }}
        />

        {/* ── Under Orders and POS ───────────────────────────────────── */}
        <Tabs.Screen name="tables" options={{ href: show("tables"), title: "Tables" }} />
        <Tabs.Screen name="scheduled" options={{ href: show("scheduled"), title: "Schedule" }} />
        <Tabs.Screen name="pos-sales" options={{ href: show("pos-sales"), title: "Drawer" }} />

        {/* ── Reports ─────────────────────────────────────────────────── */}
        <Tabs.Screen name="analytics" options={{ href: show("analytics"), title: "Analytics" }} />
        <Tabs.Screen name="trends" options={{ href: show("trends"), title: "Trends" }} />
        <Tabs.Screen name="growth" options={{ href: show("growth"), title: "Growth" }} />
        <Tabs.Screen name="customer-hub" options={{ href: show("customer-hub"), title: "Customers" }} />
        <Tabs.Screen name="customers" options={{ href: show("customers"), title: "Guest list" }} />
        <Tabs.Screen name="loyalty" options={{ href: show("loyalty"), title: "Rewards" }} />
        <Tabs.Screen
          name="product-analytics"
          options={{ href: show("product-analytics"), title: "Performance" }}
        />
        <Tabs.Screen name="daily-report" options={{ href: show("daily-report"), title: "Stock report" }} />
        <Tabs.Screen name="branches" options={{ href: show("branches"), title: "Compare branches" }} />

        {/* ── Manage ──────────────────────────────────────────────────── */}
        <Tabs.Screen
          name="product-management"
          options={{ href: show("product-management"), title: "Products" }}
        />
        <Tabs.Screen name="categories" options={{ href: show("categories"), title: "Categories" }} />
        <Tabs.Screen name="inventory" options={{ href: show("inventory"), title: "Stock" }} />
        <Tabs.Screen name="payments" options={{ href: show("payments"), title: "Payment Methods" }} />
        <Tabs.Screen name="portfolio" options={{ href: show("portfolio"), title: "Branches" }} />
        <Tabs.Screen name="branch-menu" options={{ href: show("branch-menu"), title: "Branch products" }} />

        {/* ── Detail and utility screens — never tabs ─────────────────── */}
        <Tabs.Screen name="product/[productId]" options={{ href: null, title: "Product" }} />
        <Tabs.Screen name="product/recipe/[productId]" options={{ href: null, title: "Recipe" }} />
        <Tabs.Screen name="payment/[methodId]" options={{ href: null, title: "Payment Method" }} />
        <Tabs.Screen name="category/[categoryId]" options={{ href: null, title: "Category" }} />
        <Tabs.Screen name="campaign/[campaignId]" options={{ href: null, title: "Campaign" }} />
        <Tabs.Screen name="scan" options={{ href: null, title: "Scan QR" }} />
        <Tabs.Screen name="order/[orderId]" options={{ href: null, title: "Order Detail" }} />
        {/* One table's party, its open orders and its scan-to-order code. */}
        <Tabs.Screen name="table/[tableId]" options={{ href: null, title: "Table" }} />
        <Tabs.Screen
          name="pos-loyalty"
          options={{ href: null, title: "Redeem Reward", tabBarStyle: { display: "none" } }}
        />
        <Tabs.Screen name="pos-tender" options={{ href: null, title: "Take Payment" }} />
        <Tabs.Screen name="printer-settings" options={{ href: null, title: "Printer Settings" }} />
        <Tabs.Screen name="account" options={{ href: null, title: "Account" }} />
        <Tabs.Screen name="team" options={{ href: null, title: "Team" }} />
        {/* One colleague's shifts, activity and access — pushed from Team. */}
        <Tabs.Screen name="staff/[userId]" options={{ href: null, title: "Staff" }} />
        {/* Platform "What's New" inbox + post — reached from Manage or a push. */}
        <Tabs.Screen name="whats-new/index" options={{ href: null, title: "What's New" }} />
        <Tabs.Screen name="whats-new/[announcementId]" options={{ href: null, title: "Update" }} />
        {/* Guided tour: the chapter list and one chapter — reached from the greeter or Manage. */}
        <Tabs.Screen name="tutorial/index" options={{ href: null, title: "Learn the app" }} />
        {/* The chapter draws its own bar inside the simulation, so the real one hides. */}
        <Tabs.Screen
          name="tutorial/[chapterId]"
          options={{ href: null, title: "Chapter", tabBarStyle: { display: "none" } }}
        />
      </Tabs>
    </>
  );
}
