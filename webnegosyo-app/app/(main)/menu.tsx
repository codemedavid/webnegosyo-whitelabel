import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { usePortfolioAudience } from "../../lib/use-portfolio-audience";
import { useAdvanceOrdering } from "../../lib/use-advance-ordering";
import { activeWorkspace, visibleWorkspaces } from "../../lib/portfolio-landing";
import { reachableTabsOf } from "../../lib/tab-visibility";
import { WORKSPACE_ICONS, tabPresentation } from "../../lib/workspace-presentation";
import { canOpenTeam } from "../../lib/staff-service";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import type { WorkspaceKey } from "../../lib/workspaces";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ListRow } from "../../components/ListRow";
import { Icon } from "../../components/Icon";

/**
 * The Menu hub: every screen in the app on one page.
 *
 * The five views keep the tab bar short, but they also hide four fifths of
 * the app behind a small chip in the header. This tab is always on the bar,
 * so wherever a merchant is, one tap shows the whole map: each view with the
 * screens inside it, the store's setup screens, and the tools (scanner,
 * printer, team, account) that used to be reachable only from the Home tab.
 */
export default function MenuScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const outletName = useAuthStore((s) => s.outletName);
  const isDemo = useAuthStore((s) => s.isDemo);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const outletId = useAuthStore((s) => s.outletId);
  const { isConnected, loadSaved } = usePrinterStore();
  const storedWorkspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const audience = usePortfolioAudience();
  const takesAdvanceOrders = useAdvanceOrdering();

  const caller = { role, isOwner, permissions };
  const views = visibleWorkspaces(caller, audience);
  const current = activeWorkspace(storedWorkspace, caller, audience);
  const ctx = { caller, audience, takesAdvanceOrders };
  const showTeam = canOpenTeam({ role, isOwner, permissions, outletId, isDemo });

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  // Landing on a screen from here also selects its view, so the tab bar the
  // merchant arrives on is the one that screen belongs to.
  const open = (view: WorkspaceKey, tab: string) => {
    if (view !== current) setWorkspace(view);
    goTo(router as TabAwareRouter<`/(main)/${string}`>, `/(main)/${tab}`);
  };

  const roleLabel = isDemo
    ? "Demo store"
    : isOwner
      ? "Owner"
      : role === "superadmin"
        ? "Superadmin"
        : "Staff";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Menu"
        subtitle="Everything in the app, in one place"
        showSwitcher={false}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.storeCard}
          onPress={() => router.push("/(main)/account")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Account"
          accessibilityHint="Signed-in details, sign out, delete account"
        >
          <View style={styles.storeAvatar}>
            <Text style={styles.storeAvatarText}>
              {(tenantName ?? "S").trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.storeCopy}>
            <Text style={styles.storeName} numberOfLines={1}>
              {tenantName ?? "Your store"}
            </Text>
            <Text style={styles.storeMeta} numberOfLines={1}>
              {outletName ? `${outletName} · ${roleLabel}` : roleLabel}
            </Text>
          </View>
          <Icon name="chevron" size={16} color={colors.heroInkMuted} />
        </TouchableOpacity>

        {views.map((view) => {
          const tabs = reachableTabsOf(view.key, ctx);
          const isCurrent = view.key === current;
          return (
            <View key={view.key} style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={[styles.sectionTile, isCurrent && styles.sectionTileCurrent]}>
                  <Icon
                    name={WORKSPACE_ICONS[view.key]}
                    size={18}
                    color={isCurrent ? colors.textOnDark : colors.textPrimary}
                  />
                </View>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>{view.label}</Text>
                  <Text style={styles.sectionHint} numberOfLines={1}>
                    {view.description}
                  </Text>
                </View>
                {isCurrent ? (
                  <View style={styles.currentPill}>
                    <Text style={styles.currentPillText}>Current view</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.group}>
                {tabs.map((tab, index) => {
                  const p = tabPresentation(tab);
                  return (
                    <ListRow
                      key={tab}
                      icon={p.icon}
                      title={p.label}
                      subtitle={p.hint}
                      onPress={() => open(view.key, tab)}
                      grouped={index < tabs.length - 1}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTile}>
              <Icon name="settings" size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Tools</Text>
              <Text style={styles.sectionHint}>Scanner, printer, people and account</Text>
            </View>
          </View>
          <View style={styles.group}>
            <ListRow
              icon="qr"
              title="Scan QR"
              subtitle="Confirm a pickup from the customer's code"
              onPress={() => router.push("/(main)/scan")}
              grouped
            />
            <ListRow
              icon="printer"
              title="Printer"
              subtitle={isConnected ? "Connected and ready" : "Not connected"}
              onPress={() => router.push("/(main)/printer-settings")}
              trailing={
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? colors.success : colors.textTertiary },
                  ]}
                />
              }
              grouped
            />
            {showTeam ? (
              <ListRow
                icon="customers"
                title="Team"
                subtitle="Staff accounts and what each can do"
                onPress={() => router.push("/(main)/team")}
                grouped
              />
            ) : null}
            <ListRow
              icon="account"
              title="Account"
              subtitle="Signed-in details, sign out"
              onPress={() => router.push("/(main)/account")}
            />
          </View>
        </View>

        {isDemo ? (
          <Text style={styles.demoNote}>
            You are exploring the demo store. Sign in with a merchant account to
            manage your own.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 },

  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    ...shadow.md,
  },
  storeAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  storeAvatarText: { fontSize: 18, fontWeight: "800", color: colors.textOnDark },
  storeCopy: { flex: 1 },
  storeName: { ...typography.heading, color: colors.heroInkText },
  storeMeta: { ...typography.caption, color: colors.heroInkMuted, marginTop: 2 },

  section: { marginBottom: spacing.xxl },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTileCurrent: { backgroundColor: colors.primary },
  sectionCopy: { flex: 1 },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  sectionHint: { ...typography.caption, color: colors.textSecondary },
  currentPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.warningLight,
  },
  currentPillText: { ...typography.small, fontWeight: "700", color: colors.statusPending.text },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  demoNote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
