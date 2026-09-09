import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { SectionHeader } from "../../SectionHeader";
import { Button } from "../../Button";
import { Badge } from "../../Badge";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import { MockToast, MockViewChip, SceneFrame, type SceneProps } from "./shared";

/** The Drawer, after the sale the tour just rang up. */
const SALES = [
  { time: "10:42 AM", method: "Cash · ₱175.00 change", total: 325 },
  { time: "10:17 AM", method: "GCash", total: 240 },
  { time: "9:55 AM", method: "Cash · ₱10.00 change", total: 90 },
  { time: "9:31 AM", method: "Maya", total: 515 },
];

export function DrawerScene({ phase, tried, onTried }: SceneProps) {
  const [includesOnline, setIncludesOnline] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const expected = includesOnline ? 4_130 : 2_890;

  return (
    <SceneFrame workspace="register" activeTab="pos-sales">
      <ScreenHeader title="Drawer" subtitle="Today at the register" leading={<MockViewChip workspace="register" />} />
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "recorded" ? <MockToast text="Sale recorded · receipt printed" /> : null}

        {phase === "incoming" ? (
          <>
            <SectionHeader title="Incoming orders" />
            <View style={styles.card}>
              <View style={styles.incomingRow}>
                <View style={styles.incomingCopy}>
                  <Text style={styles.incomingTitle}>Jun Reyes · 4 items · {formatPeso(515)}</Text>
                  <Text style={styles.meta}>{isConfirmed ? "Status: confirmed" : "Waiting for confirmation"}</Text>
                </View>
                {isConfirmed ? (
                  <Badge label="confirmed" variant="confirmed" />
                ) : (
                  <CoachTarget active={!tried}>
                    <Button label="Confirm" size="sm" onPress={() => { setIsConfirmed(true); onTried(); }} />
                  </CoachTarget>
                )}
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Expected in drawer</Text>
          <Text style={styles.heroAmount}>{formatPeso(expected)}</Text>
          <Text style={styles.heroHint}>Cash sales before ₱185.00 change handed out</Text>
        </View>
        <View style={styles.stats}>
          <Stat label="Sales" value={includesOnline ? "11" : "8"} />
          <Stat label="Gross" value={formatPeso(includesOnline ? 5_240 : 3_410)} />
          <Stat label="Non-cash" value={formatPeso(includesOnline ? 1_110 : 755)} />
        </View>
        <CoachTarget active={phase === "summary" && !tried}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Count Smart Menu orders</Text>
              <Text style={styles.meta}>Include online orders confirmed here, using what has actually been paid</Text>
            </View>
            <Switch
              value={includesOnline}
              onValueChange={(v) => { setIncludesOnline(v); if (v && phase === "summary") onTried(); }}
              trackColor={{ true: colors.success, false: colors.separator }}
              accessibilityLabel="Count Smart Menu orders"
            />
          </View>
        </CoachTarget>
        <SectionHeader title="Sales" />
        <View style={styles.card}>
          {SALES.map((s, i) => (
            <View key={s.time} style={[styles.saleRow, i < SALES.length - 1 && styles.saleRowGrouped]}>
              <View style={styles.incomingCopy}>
                <Text style={styles.saleTime}>{s.time}</Text>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  hero: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.xl, gap: 2, ...shadow.md },
  heroEyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroAmount: { fontSize: 36, fontWeight: "800", color: colors.heroInkText, letterSpacing: -1 },
  heroHint: { ...typography.caption, color: colors.heroInkMuted },
  stats: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  statValue: { ...typography.heading, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radius.md, overflow: "hidden", ...shadow.sm },
  incomingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  incomingCopy: { flex: 1, gap: 2 },
  incomingTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  saleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  saleRowGrouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  saleTime: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  saleTotal: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
});
