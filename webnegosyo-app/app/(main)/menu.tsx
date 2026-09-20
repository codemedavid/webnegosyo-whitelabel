import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router } from "expo-router";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { MANAGE_SECTIONS, hubSections } from "../../lib/hubs";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { tabPresentation } from "../../lib/workspace-presentation";
import { canOpenTeam } from "../../lib/staff-service";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import { TUTORIAL_HUB_ROUTE } from "../../lib/tutorial/routes";
import { useTutorialChapters, useTutorialProgress } from "../../lib/tutorial/use-tutorial";
import { progressSummary } from "../../lib/tutorial/progress";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ListRow } from "../../components/ListRow";
import { Icon } from "../../components/Icon";

/**
 * The Manage hub: everything the merchant sets up, in one place.
 *
 * Products, stock and payments; the branches, for an account that runs
 * several; the people and the device; and the account itself. None of these
 * is a view of a shift, so none of them belongs on the bar — they are where a
 * merchant goes to change how the store works, and this is the one door.
 *
 * The store rows come from lib/hubs.ts, filtered to what this account may
 * open. The tool rows are gated where their gate already lives (canOpenTeam,
 * the printer store), so this screen invents no rule of its own.
 */
export default function ManageScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const outletName = useAuthStore((s) => s.outletName);
  const isDemo = useAuthStore((s) => s.isDemo);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const outletId = useAuthStore((s) => s.outletId);
  const isConnected = usePrinterStore((s) => s.isConnected);
  const loadSaved = usePrinterStore((s) => s.loadSaved);

  const ctx = useTabVisibilityContext();
  const sections = hubSections(MANAGE_SECTIONS, ctx);
  const showTeam = canOpenTeam({ role, isOwner, permissions, outletId, isDemo });
  const chapters = useTutorialChapters();
  const { progress: tutorialProgress } = useTutorialProgress();
  const tour = progressSummary(tutorialProgress, chapters.map((c) => c.id));

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const open = (tab: string) =>
    goTo(router as TabAwareRouter<`/(main)/${string}`>, `/(main)/${tab}`);

  const roleLabel = isDemo
    ? "Demo store"
    : isOwner
      ? "Owner"
      : role === "superadmin"
        ? "Superadmin"
        : "Staff";

  const tourHint = tour.isComplete
    ? "Tour complete — replay any chapter"
    : tour.completed === 0
      ? `Guided tour, ${chapters.length} short chapters`
      : `${tour.completed} of ${tour.total} chapters done`;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Manage" subtitle="How the store works" />
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

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.group}>
              {section.tabs.map((tab, index) => {
                const p = tabPresentation(tab);
                return (
                  <ListRow
                    key={tab}
                    icon={p.icon}
                    title={p.label}
                    subtitle={p.hint}
                    onPress={() => open(tab)}
                    grouped={index < section.tabs.length - 1}
                  />
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People and device</Text>
          <View style={styles.group}>
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
            <ListRow
              icon="qr"
              title="Scan QR"
              subtitle="Confirm a pickup from the customer's code"
              onPress={() => router.push("/(main)/scan")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help and account</Text>
          <View style={styles.group}>
            <ListRow
              icon="info"
              tone="accent"
              title="Learn the app"
              subtitle={tourHint}
              onPress={() => router.push(TUTORIAL_HUB_ROUTE)}
              grouped
            />
            <ListRow
              icon="info"
              title="What's new"
              subtitle="Release notes and announcements"
              onPress={() => router.push("/(main)/whats-new")}
              grouped
            />
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
    marginBottom: spacing.xl,
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

  section: { marginBottom: spacing.xl },
  sectionTitle: {
    ...typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
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
