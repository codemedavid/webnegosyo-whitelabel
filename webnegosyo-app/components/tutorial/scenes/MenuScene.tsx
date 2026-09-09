import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { ListRow } from "../../ListRow";
import { Icon } from "../../Icon";
import { WORKSPACES } from "../../../lib/workspaces";
import { WORKSPACE_ICONS, tabPresentation } from "../../../lib/workspace-presentation";
import { SceneFrame, useSceneStoreName } from "./shared";

/** The Menu hub, as menu.tsx draws it: the store card, every view, the tools. */
export function MenuScene() {
  const storeName = useSceneStoreName();
  const views = WORKSPACES.filter((w) => w.key !== "business");
  return (
    <SceneFrame workspace="operations" activeTab="menu">
      <ScreenHeader title="Menu" subtitle="Everything in the app, in one place" showSwitcher={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.storeCard}>
          <View style={styles.storeAvatar}>
            <Text style={styles.storeAvatarText}>{storeName.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.storeCopy}>
            <Text style={styles.storeName} numberOfLines={1}>{storeName}</Text>
            <Text style={styles.storeMeta}>Main branch · Owner</Text>
          </View>
          <Icon name="chevron" size={16} color={colors.heroInkMuted} />
        </View>
        {views.map((view) => {
          const tabs = view.tabs.filter((t) => t !== "customer-hub");
          const isCurrent = view.key === "operations";
          return (
            <View key={view.key} style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={[styles.sectionTile, isCurrent && styles.sectionTileCurrent]}>
                  <Icon name={WORKSPACE_ICONS[view.key]} size={18} color={isCurrent ? colors.textOnDark : colors.textPrimary} />
                </View>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>{view.label}</Text>
                  <Text style={styles.sectionHint} numberOfLines={1}>{view.description}</Text>
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
                  return <ListRow key={tab} icon={p.icon} title={p.label} subtitle={p.hint} onPress={() => {}} grouped={index < tabs.length - 1} />;
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
            <ListRow icon="info" tone="accent" title="Learn the app" subtitle="Guided tour, 11 short chapters" onPress={() => {}} grouped />
            <ListRow icon="qr" title="Scan QR" subtitle="Confirm a pickup from the customer's code" onPress={() => {}} grouped />
            <ListRow icon="printer" title="Printer" subtitle="Connected and ready" onPress={() => {}} trailing={<View style={styles.statusDot} />} grouped />
            <ListRow icon="customers" title="Team" subtitle="Staff accounts and what each can do" onPress={() => {}} grouped />
            <ListRow icon="account" title="Account" subtitle="Signed-in details, sign out" onPress={() => {}} />
          </View>
        </View>
      </ScrollView>
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 },
  storeCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xxl, ...shadow.md },
  storeAvatar: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  storeAvatarText: { fontSize: 18, fontWeight: "800", color: colors.textOnDark },
  storeCopy: { flex: 1 },
  storeName: { ...typography.heading, color: colors.heroInkText },
  storeMeta: { ...typography.caption, color: colors.heroInkMuted, marginTop: 2 },
  section: { marginBottom: spacing.xxl },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  sectionTile: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  sectionTileCurrent: { backgroundColor: colors.primary },
  sectionCopy: { flex: 1 },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  sectionHint: { ...typography.caption, color: colors.textSecondary },
  currentPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.warningLight },
  currentPillText: { ...typography.small, fontWeight: "700", color: colors.statusPending.text },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
});
