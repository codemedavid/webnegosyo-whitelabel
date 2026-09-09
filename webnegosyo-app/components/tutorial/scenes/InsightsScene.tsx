import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { IconButton } from "../../IconButton";
import { SectionHeader } from "../../SectionHeader";
import { StatCard } from "../../StatCard";
import { HeroRevenueCard } from "../../HeroRevenueCard";
import { Button } from "../../Button";
import { SegmentedControl } from "../../SegmentedControl";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import { MOCK_GUESTS } from "../../../lib/tutorial/mock-data";
import { MockSheet, MockViewChip, SceneFrame, type SceneProps } from "./shared";

/** Analytics, Growth and Customers, sharing one month of the store's trade. */
const WINDOWS = [
  { days: 7, revenue: 18_420, orders: 64, aov: 288, byType: [["Pickup", 0.52], ["Dine-in", 0.31], ["Delivery", 0.17]] as const },
  { days: 14, revenue: 36_150, orders: 121, aov: 299, byType: [["Pickup", 0.49], ["Dine-in", 0.34], ["Delivery", 0.17]] as const },
  { days: 30, revenue: 79_900, orders: 268, aov: 298, byType: [["Pickup", 0.47], ["Dine-in", 0.36], ["Delivery", 0.17]] as const },
];

export function InsightsScene({ phase, tried, onTried }: SceneProps) {
  if (phase === "growth") return <GrowthScene phase={phase} tried={tried} onTried={onTried} />;
  if (phase === "customers") return <CustomersScene phase={phase} tried={tried} onTried={onTried} />;
  return <AnalyticsScene phase={phase} tried={tried} onTried={onTried} />;
}

function AnalyticsScene({ phase, tried, onTried }: SceneProps) {
  const [days, setDays] = useState(7);
  const w = WINDOWS.find((x) => x.days === days) ?? WINDOWS[0];
  return (
    <SceneFrame workspace="insights" activeTab="analytics">
      <ScreenHeader title="Analytics" subtitle={`Last ${days} days`} leading={<MockViewChip workspace="insights" />} actions={<IconButton icon="export" label="Export" onPress={() => {}} />}>
        <CoachTarget active={phase === "analytics" && !tried} padding={4}>
          <View style={styles.pills}>
            {WINDOWS.map((x) => (
              <TouchableOpacity key={x.days} style={[styles.pill, x.days === days && styles.pillActive]} onPress={() => { setDays(x.days); if (x.days === 30 && phase === "analytics") onTried(); }} accessibilityRole="button" accessibilityLabel={`${x.days} days`}>
                <Text style={[styles.pillText, x.days === days && styles.pillTextActive]}>{x.days} days</Text>
              </TouchableOpacity>
            ))}
          </View>
        </CoachTarget>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content}>
        <HeroRevenueCard revenue={w.revenue} orderCount={w.orders} avgOrder={w.aov} periodLabel={`Last ${days} days`} />
        <View style={styles.stats}>
          <StatCard value={w.orders} label="Orders" />
          <StatCard value={formatPeso(w.aov)} label="Avg Order Value" />
        </View>
        <SectionHeader title="Revenue by Order Type" />
        <View style={styles.card}>
          {w.byType.map(([label, share]) => (
            <View key={label} style={styles.barRow}>
              <Text style={styles.barLabel}>{label}</Text>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${share * 100}%` }]} /></View>
              <Text style={styles.barValue}>{formatPeso(Math.round(w.revenue * share))}</Text>
            </View>
          ))}
        </View>
        <SectionHeader title="Revenue by Payment Method" />
        <View style={styles.card}>
          {[["Cash", 0.44], ["GCash", 0.38], ["Card", 0.18]].map(([label, share]) => (
            <View key={String(label)} style={styles.barRow}>
              <Text style={styles.barLabel}>{label}</Text>
              <View style={styles.barTrack}><View style={[styles.barFill, styles.barFillAlt, { width: `${Number(share) * 100}%` }]} /></View>
              <Text style={styles.barValue}>{Math.round(Number(share) * 100)}%</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SceneFrame>
  );
}

const COACH_TEXT =
  "Your repeat rate is 18% against a 30% benchmark, while basket size is already above par. The lever is the second order: a follow-up to the 42 guests who ordered once in the last 30 days, with a small reason to come back this week.";
const TYPE_MS = 16;

function GrowthScene({ phase, tried, onTried }: SceneProps) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!tried) return;
    const id = setInterval(() => setShown((n) => Math.min(COACH_TEXT.length, n + 3)), TYPE_MS);
    return () => clearInterval(id);
  }, [tried]);
  return (
    <SceneFrame workspace="insights" activeTab="growth">
      <ScreenHeader title="Growth" subtitle="Last 30 days" leading={<MockViewChip workspace="insights" />} />
      <ScrollView contentContainerStyle={styles.content}>
        <HeroRevenueCard revenue={79_900} orderCount={268} avgOrder={298} periodLabel="Last 30 days" />
        <SectionHeader title="Growth engine" />
        <View style={styles.card}>
          <Lever name="Repeat rate" value="18%" benchmark="30%" tone={colors.danger} />
          <Lever name="Basket size" value={formatPeso(298)} benchmark={formatPeso(250)} tone={colors.success} />
          <Lever name="Orders per day" value="9" benchmark="12" tone={colors.statusPending.text} />
        </View>
        <View style={styles.verdict}>
          <Text style={styles.verdictTitle}>Win back your one-time guests</Text>
          <Text style={styles.verdictBody}>Baskets are strong. Growth is in the second order, not the first.</Text>
        </View>
        <SectionHeader title="Ask the coach" />
        {tried ? (
          <View style={styles.coach}>
            <Text style={styles.coachText}>{COACH_TEXT.slice(0, shown)}</Text>
          </View>
        ) : (
          <CoachTarget active={phase === "growth"}>
            <Button label="Ask the coach" onPress={onTried} size="lg" icon="growth" />
          </CoachTarget>
        )}
      </ScrollView>
    </SceneFrame>
  );
}

function Lever({ name, value, benchmark, tone }: { name: string; value: string; benchmark: string; tone: string }) {
  return (
    <View style={styles.lever}>
      <View style={styles.leverCopy}>
        <Text style={styles.leverName}>{name}</Text>
        <Text style={styles.leverBench}>Benchmark {benchmark}</Text>
      </View>
      <Text style={[styles.leverValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function CustomersScene({ phase, tried, onTried }: SceneProps) {
  const [tab, setTab] = useState<"guests" | "campaigns">("guests");
  const [isComposing, setIsComposing] = useState(false);
  return (
    <SceneFrame workspace="insights" activeTab="customer-hub">
      <ScreenHeader title="Customers" subtitle={`${MOCK_GUESTS.length} guests`} leading={<MockViewChip workspace="insights" />} actions={<IconButton icon="export" label="Export" onPress={() => {}} />}>
        <SegmentedControl options={[{ label: `Guests ${MOCK_GUESTS.length}`, value: "guests" }, { label: "Campaigns 0", value: "campaigns" }]} value={tab} onChange={setTab} accessibilityPrefix="Show" />
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === "guests" ? (
          <>
            <View style={styles.pills}>
              {["Everyone", "Regulars", "Ordered once", "Lapsed"].map((f, i) => (
                <View key={f} style={[styles.pill, i === 2 && styles.pillActive]}><Text style={[styles.pillText, i === 2 && styles.pillTextActive]}>{f}</Text></View>
              ))}
            </View>
            <View style={styles.card}>
              {MOCK_GUESTS.filter((g) => g.orders === 1).map((g, i, arr) => (
                <View key={g.name} style={[styles.guest, i < arr.length - 1 && styles.guestGrouped]}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{g.name.charAt(0)}</Text></View>
                  <View style={styles.leverCopy}>
                    <Text style={styles.leverName}>{g.name}</Text>
                    <Text style={styles.leverBench}>{g.orders} order · {g.lastLabel}</Text>
                  </View>
                  <Text style={styles.guestSpend}>{formatPeso(g.spend)}</Text>
                </View>
              ))}
            </View>
            <CoachTarget active={phase === "customers" && !tried && !isComposing}>
              <Button label="New campaign" onPress={() => setIsComposing(true)} size="lg" icon="plus" />
            </CoachTarget>
          </>
        ) : (
          <Text style={styles.empty}>No campaigns yet. A campaign is one message, sent to the guests you choose, on a date you pick.</Text>
        )}
      </ScrollView>
      {isComposing ? (
        <MockSheet title="New campaign" hint="One message, to the guests you choose, on a date you pick.">
          <Row label="Audience" value="Ordered once · last 30 days · 3 guests" />
          <Row label="Message" value="We miss you! Show this for a free upsize this week." />
          <Row label="Send on" value="Saturday, 10:00 AM" />
          <CoachTarget active={!tried}>
            <Button label="Schedule campaign" onPress={() => { setIsComposing(false); onTried(); }} size="lg" />
          </CoachTarget>
        </MockSheet>
      ) : null}
    </SceneFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: { height: 34, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  pillTextActive: { color: colors.textOnDark },
  stats: { flexDirection: "row", gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  barLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary, width: 64 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.primaryLight, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.accent, borderRadius: 4 },
  barFillAlt: { backgroundColor: colors.primary },
  barValue: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, minWidth: 64, textAlign: "right" },
  lever: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  leverCopy: { flex: 1, gap: 2 },
  leverName: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  leverBench: { ...typography.caption, color: colors.textSecondary },
  leverValue: { ...typography.heading },
  verdict: { backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  verdictTitle: { ...typography.body, fontWeight: "800", color: colors.statusPending.text },
  verdictBody: { ...typography.caption, color: colors.statusPending.text },
  coach: { backgroundColor: colors.card, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.accent, padding: spacing.lg, minHeight: 96, ...shadow.sm },
  coachText: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  guest: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  guestGrouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { ...typography.body, fontWeight: "800", color: colors.textOnDark },
  guestSpend: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.xxl },
  row: { gap: 2, paddingVertical: spacing.xs },
  rowLabel: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  rowValue: { ...typography.body, color: colors.textPrimary },
});
