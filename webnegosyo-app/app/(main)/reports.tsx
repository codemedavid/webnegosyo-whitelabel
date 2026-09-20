import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { router } from "expo-router";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { useAuthStore } from "../../stores/auth-store";
import { REPORTS_SECTIONS, hubSections } from "../../lib/hubs";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { tabPresentation } from "../../lib/workspace-presentation";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ListRow } from "../../components/ListRow";
import { EmptyState } from "../../components/EmptyState";

/**
 * The Reports hub: everything the merchant reads, in one place.
 *
 * Sales, customers, products and branches used to be spread over two views
 * and three sub-screens, so answering "how did last week go?" meant knowing
 * which view held the chart. This tab is the one door to all of it. Each
 * section is a short grouped list; the rows come from lib/hubs.ts, filtered
 * to what this account may open, so a cashier with no analytics grant never
 * sees a row that refuses them — and never sees this tab at all.
 */
export default function ReportsScreen() {
  const outletName = useAuthStore((s) => s.outletName);
  const ctx = useTabVisibilityContext();
  const sections = hubSections(REPORTS_SECTIONS, ctx);

  const open = (tab: string) =>
    goTo(router as TabAwareRouter<`/(main)/${string}`>, `/(main)/${tab}`);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Reports"
        subtitle={outletName ? `How ${outletName} is doing` : "How the store is doing"}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {sections.length === 0 ? (
          <EmptyState message="Your account has no reports to show" />
        ) : (
          sections.map((section) => (
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
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 },
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
});
