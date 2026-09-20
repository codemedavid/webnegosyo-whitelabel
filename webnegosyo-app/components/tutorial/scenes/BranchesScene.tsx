import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { SectionHeader } from "../../SectionHeader";
import { OrderCard } from "../../OrderCard";
import { Icon } from "../../Icon";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import { MOCK_BRANCHES, mockQueue } from "../../../lib/tutorial/mock-data";
import { SceneFrame, useSceneStoreName, type SceneProps } from "./shared";

/** The branch screens under Manage: every branch at a glance, and per-branch products. */
export function BranchesScene({ phase, tried, onTried }: SceneProps) {
  if (phase === "menu") return <BranchMenuScene phase={phase} tried={tried} onTried={onTried} />;
  return <PortfolioScene phase={phase} tried={tried} onTried={onTried} />;
}

function PortfolioScene({ phase, tried, onTried }: SceneProps) {
  const storeName = useSceneStoreName();
  const target = MOCK_BRANCHES[1];
  const total = MOCK_BRANCHES.reduce((s, b) => s + b.revenue, 0);

  if (tried && phase === "portfolio") {
    const orders = mockQueue().slice(0, 3);
    return (
      <SceneFrame activeTab="orders">
        <View style={styles.contextBar}>
          <Icon name="storefront" size={14} color={colors.textOnDark} />
          <Text style={styles.contextText}>Viewing {target.name}</Text>
          <Text style={styles.contextLink}>Whole store</Text>
        </View>
        <ScreenHeader title="Orders" subtitle={`${orders.length} shown · ${target.name}`} ignoreTopInset />
        <ScrollView contentContainerStyle={styles.content}>
          {orders.map((o) => (
            <OrderCard key={o._id} order={o} onPress={() => {}} />
          ))}
        </ScrollView>
      </SceneFrame>
    );
  }

  return (
    <SceneFrame activeTab="portfolio">
      <ScreenHeader title="Your business" subtitle={`${storeName} · ${MOCK_BRANCHES.length} branches · today`} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>All branches · today</Text>
          <Text style={styles.heroAmount}>{formatPeso(total)}</Text>
          <Text style={styles.heroHint}>{MOCK_BRANCHES.reduce((s, b) => s + b.orders, 0)} orders across {MOCK_BRANCHES.length} branches</Text>
        </View>
        <SectionHeader title="Branches" hint="Ranked by today's takings" />
        {MOCK_BRANCHES.map((b) => {
          const isSlow = b.verdict !== "On pace";
          const card = (
            <TouchableOpacity style={styles.branch} onPress={b.id === target.id && phase === "portfolio" ? onTried : () => {}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={b.name}>
              <View style={styles.branchCopy}>
                <Text style={styles.branchName}>{b.name}</Text>
                <Text style={styles.meta}>{b.orders} orders · avg {formatPeso(Math.round(b.revenue / b.orders))}</Text>
              </View>
              <View style={styles.branchRight}>
                <Text style={styles.branchRevenue}>{formatPeso(b.revenue)}</Text>
                <Text style={[styles.verdict, isSlow ? styles.verdictWarn : styles.verdictGood]}>{b.verdict}</Text>
              </View>
              <Icon name="chevron" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          );
          return b.id === target.id && phase === "portfolio" ? <CoachTarget key={b.id} active={!tried} padding={4}>{card}</CoachTarget> : <View key={b.id}>{card}</View>;
        })}
      </ScrollView>
    </SceneFrame>
  );
}

function BranchMenuScene({ phase, tried, onTried }: SceneProps) {
  const [sold, setSold] = useState<Record<string, boolean>>(Object.fromEntries(MOCK_BRANCHES.map((b) => [b.id, true])));
  const target = MOCK_BRANCHES[1];
  return (
    <SceneFrame activeTab="branch-menu">
      <ScreenHeader title="Branch products" subtitle="Which branch sells what" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.product}>
          <View style={styles.productPhoto} />
          <View style={styles.branchCopy}>
            <Text style={styles.branchName}>Ham &amp; Cheese Croissant</Text>
            <Text style={styles.meta}>{formatPeso(150)} store-wide · Pastries</Text>
          </View>
        </View>
        <SectionHeader title="Sold at" hint="No override means the store-wide setting applies" />
        <View style={styles.group}>
          {MOCK_BRANCHES.map((b, i) => {
            const row = (
              <View style={[styles.overrideRow, i < MOCK_BRANCHES.length - 1 && styles.overrideRowGrouped]}>
                <View style={styles.branchCopy}>
                  <Text style={styles.branchName}>{b.name}</Text>
                  <Text style={styles.meta}>{sold[b.id] ? "Sold · store price" : "Not sold at this branch"}</Text>
                </View>
                <Switch value={sold[b.id]} onValueChange={(v) => { setSold({ ...sold, [b.id]: v }); if (!v && b.id === target.id && phase === "menu") onTried(); }} trackColor={{ true: colors.success, false: colors.separator }} accessibilityLabel={`Sold at ${b.name}`} />
              </View>
            );
            return b.id === target.id ? <CoachTarget key={b.id} active={!tried} padding={0}>{row}</CoachTarget> : <View key={b.id}>{row}</View>;
          })}
        </View>
      </ScrollView>
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  hero: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.xl, gap: 2, ...shadow.md },
  heroEyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroAmount: { fontSize: 36, fontWeight: "800", color: colors.heroInkText, letterSpacing: -1 },
  heroHint: { ...typography.caption, color: colors.heroInkMuted },
  branch: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  branchCopy: { flex: 1, gap: 2 },
  branchName: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  branchRight: { alignItems: "flex-end", gap: 4 },
  branchRevenue: { ...typography.heading, color: colors.textPrimary },
  verdict: { ...typography.small, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  verdictGood: { color: colors.success, backgroundColor: colors.successLight },
  verdictWarn: { color: colors.statusPending.text, backgroundColor: colors.warningLight },
  contextBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.heroInk, paddingHorizontal: spacing.xl, paddingTop: 52, paddingBottom: spacing.sm },
  contextText: { ...typography.caption, fontWeight: "700", color: colors.heroInkText, flex: 1 },
  contextLink: { ...typography.caption, fontWeight: "700", color: colors.tabBarActive },
  product: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  productPhoto: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: "#E8B98A" },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  overrideRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.card },
  overrideRowGrouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
});
