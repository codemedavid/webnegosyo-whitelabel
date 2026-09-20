import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { ListRow } from "../../ListRow";
import { Icon } from "../../Icon";
import { MANAGE_SECTIONS } from "../../../lib/hubs";
import { tabPresentation } from "../../../lib/workspace-presentation";
import { SceneFrame, useSceneStoreName } from "./shared";

/** The Manage hub, as menu.tsx draws it for a single-branch owner. */
export function MenuScene() {
  const storeName = useSceneStoreName();
  // The tour is set in a one-branch store, so the Branches section is absent
  // exactly as it would be for that merchant.
  const sections = MANAGE_SECTIONS.filter((section) => section.title !== "Branches");
  return (
    <SceneFrame activeTab="menu">
      <ScreenHeader title="Manage" subtitle="How the store works" />
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
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.group}>
              {section.tabs.map((tab, index) => {
                const p = tabPresentation(tab);
                return <ListRow key={tab} icon={p.icon} title={p.label} subtitle={p.hint} onPress={() => {}} grouped={index < section.tabs.length - 1} />;
              })}
            </View>
          </View>
        ))}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People and device</Text>
          <View style={styles.group}>
            <ListRow icon="customers" title="Team" subtitle="Staff accounts and what each can do" onPress={() => {}} grouped />
            <ListRow icon="printer" title="Printer" subtitle="Connected and ready" onPress={() => {}} trailing={<View style={styles.statusDot} />} grouped />
            <ListRow icon="qr" title="Scan QR" subtitle="Confirm a pickup from the customer's code" onPress={() => {}} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help and account</Text>
          <View style={styles.group}>
            <ListRow icon="info" tone="accent" title="Learn the app" subtitle="Guided tour, 11 short chapters" onPress={() => {}} grouped />
            <ListRow icon="info" title="What's new" subtitle="Release notes and announcements" onPress={() => {}} grouped />
            <ListRow icon="account" title="Account" subtitle="Signed-in details, sign out" onPress={() => {}} />
          </View>
        </View>
      </ScrollView>
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 },
  storeCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, ...shadow.md },
  storeAvatar: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  storeAvatarText: { fontSize: 18, fontWeight: "800", color: colors.textOnDark },
  storeCopy: { flex: 1 },
  storeName: { ...typography.heading, color: colors.heroInkText },
  storeMeta: { ...typography.caption, color: colors.heroInkMuted, marginTop: 2 },
  section: { marginBottom: spacing.xl },
  sectionTitle: { ...typography.caption, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: colors.textTertiary, marginBottom: spacing.sm },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
});
