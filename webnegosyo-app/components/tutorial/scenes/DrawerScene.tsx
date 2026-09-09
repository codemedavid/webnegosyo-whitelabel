import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { SectionHeader } from "../../SectionHeader";
import { SegmentedControl } from "../../SegmentedControl";
import { Button } from "../../Button";
import { Badge } from "../../Badge";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import {
  DRAWER_COUNTING_OPTIONS,
  countingFromPolicy,
  policyFromCounting,
  describeCounting,
  describeIntake,
  describeShiftSales,
  drawerBreakdown,
} from "../../../lib/drawer-view";
import { MockToast, MockViewChip, SceneFrame, type SceneProps } from "./shared";

/** The Drawer, after the sale the tour just rang up. */
const SALES = [
  { time: "10:42 AM", method: "Cash  ·  ₱175.00 change", total: 325, tag: null },
  { time: "10:17 AM", method: "GCash", total: 240, tag: null },
  { time: "9:55 AM", method: "Cash  ·  ₱10.00 change", total: 90, tag: null },
  { time: "9:31 AM", method: "Maya", total: 515, tag: "Smart Menu" },
];

export function DrawerScene({ phase, tried, onTried }: SceneProps) {
  const [includesOnline, setIncludesOnline] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const counting = countingFromPolicy(includesOnline);

  // Mirrors the real screen: the headline is cash, and the lines under it are
  // whatever `drawerBreakdown` decides to show.
  const summary = includesOnline
    ? { saleCount: 11, grossTotal: 5_240, cashTotal: 4_130, nonCashTotal: 1_110, changeGiven: 185, refundsPaid: 0 }
    : { saleCount: 8, grossTotal: 3_410, cashTotal: 2_890, nonCashTotal: 755, changeGiven: 185, refundsPaid: 0 };
  const sales = includesOnline ? SALES : SALES.filter((s) => s.tag === null);

  return (
    <SceneFrame workspace="register" activeTab="pos-sales">
      <ScreenHeader
        title="Drawer"
        subtitle="What this shift has taken in"
        leading={<MockViewChip workspace="register" />}
      >
        <CoachTarget active={phase === "summary" && !tried}>
          <SegmentedControl
            options={DRAWER_COUNTING_OPTIONS}
            value={counting}
            onChange={(next) => {
              const on = policyFromCounting(next);
              setIncludesOnline(on);
              if (on && phase === "summary") onTried();
            }}
            accessibilityPrefix="Count"
          />
        </CoachTarget>
      </ScreenHeader>

      <ScrollView contentContainerStyle={styles.content}>
        {phase === "recorded" ? <MockToast text="Sale recorded · receipt printed" /> : null}

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Expected in drawer · Cash</Text>
          <Text style={styles.heroAmount}>{formatPeso(summary.cashTotal)}</Text>
          <View style={styles.heroDivider} />
          <View style={styles.heroLines}>
            {drawerBreakdown(summary).map((line) => (
              <View key={line.key} style={styles.heroLine}>
                <Text style={styles.heroLineLabel}>{line.label}</Text>
                <Text style={styles.heroLineValue}>{formatPeso(line.value)}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={styles.heroNote}>{describeCounting(counting)}</Text>

        {phase === "incoming" ? (
          <>
            <SectionHeader title="Incoming orders" hint={describeIntake(1)} />
            <View style={styles.card}>
              <View style={styles.incomingRow}>
                <View style={styles.incomingCopy}>
                  <Text style={styles.incomingTitle}>Jun Reyes · 4 items · {formatPeso(515)}</Text>
                  <Text style={styles.meta}>
                    {isConfirmed ? "Already confirmed — it is moving through the kitchen." : "Not accepted yet"}
                  </Text>
                </View>
                {isConfirmed ? (
                  <Badge label="confirmed" variant="confirmed" />
                ) : (
                  <CoachTarget active={!tried}>
                    <Button label="Accept" size="sm" onPress={() => { setIsConfirmed(true); onTried(); }} />
                  </CoachTarget>
                )}
              </View>
            </View>
          </>
        ) : null}

        <SectionHeader title="Sales" hint={describeShiftSales(sales.length, counting)} />
        <View style={styles.card}>
          {sales.map((s, i) => (
            <View key={s.time} style={[styles.saleRow, i < sales.length - 1 && styles.saleRowGrouped]}>
              <View style={styles.incomingCopy}>
                <View style={styles.saleTitleRow}>
                  <Text style={styles.saleTime}>{s.time}</Text>
                  {s.tag ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{s.tag}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.meta}>{s.method}</Text>
              </View>
              <Text style={styles.saleTotal}>{formatPeso(s.total)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 },
  hero: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.xl, ...shadow.md },
  heroEyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroAmount: { fontSize: 40, fontWeight: "800", color: colors.heroInkText, marginTop: spacing.sm },
  heroDivider: { height: 1, backgroundColor: colors.heroInkElevated, marginVertical: spacing.lg },
  heroLines: { gap: spacing.sm },
  heroLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroLineLabel: { ...typography.caption, color: colors.heroInkMuted },
  heroLineValue: { ...typography.caption, fontWeight: "700", color: colors.heroInkText },
  heroNote: { ...typography.small, color: colors.textSecondary, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  meta: { ...typography.caption, color: colors.textSecondary },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  incomingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  incomingCopy: { flex: 1, gap: 2 },
  incomingTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  saleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  saleRowGrouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  saleTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  saleTime: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  saleTotal: { ...typography.heading, color: colors.textPrimary },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle },
  tagText: { ...typography.small, fontWeight: "700", color: colors.textSecondary },
});
