import React, { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { IconButton } from "../../IconButton";
import { PeriodSelector } from "../../PeriodSelector";
import { HeroRevenueCard } from "../../HeroRevenueCard";
import { StatCard } from "../../StatCard";
import { SectionHeader } from "../../SectionHeader";
import { StatusPipeline } from "../../StatusPipeline";
import { OrderCard } from "../../OrderCard";
import { EmptyState } from "../../EmptyState";
import { ListRow } from "../../ListRow";
import { Icon } from "../../Icon";
import { CoachTarget } from "../spotlight";
import { MOCK_TODAY, mockIncomingOrder, mockQueue } from "../../../lib/tutorial/mock-data";
import { WORKSPACES } from "../../../lib/workspaces";
import { WORKSPACE_ICONS, tabLabel } from "../../../lib/workspace-presentation";
import { MockSheet, MockTabBar, MockToast, MockViewChip, SceneFrame, useSceneStoreName, type SceneProps } from "./shared";
import { MenuScene } from "./MenuScene";
import { OrderDetailScene } from "./OrderDetailScene";
import { RegisterScene } from "./RegisterScene";
import { ToolsScene } from "./ToolsScene";

/**
 * Home, as the merchant will see it on their first morning — set in their own
 * store, with the day's takings, the queue, and the order the tour follows.
 */
const PERIODS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "This Year", value: "this_year" },
];

const ARRIVAL_DELAY_MS = 1400;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeScene({ phase, tried, onTried }: SceneProps) {
  const storeName = useSceneStoreName();
  const [period, setPeriod] = useState("today");
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [hasArrived, setHasArrived] = useState(phase !== "arrive");
  const arrive = useRef(new Animated.Value(phase === "arrive" ? 0 : 1)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (phase !== "arrive") return;
    const id = setTimeout(() => {
      setHasArrived(true);
      Animated.spring(arrive, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }).start();
      // The card lands at the foot of a long screen; bring it into view.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }, ARRIVAL_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, arrive]);

  // After the step is done, the scene shows where the tap led.
  if (tried && phase === "views") return <RegisterScene phase="browse" tried={false} onTried={() => {}} />;
  if (tried && phase === "menu") return <MenuScene />;
  if (tried && phase === "header") return <ToolsScene phase="camera" tried={false} onTried={() => {}} />;
  if (tried && phase === "arrive") return <OrderDetailScene phase="view" tried={false} onTried={() => {}} />;

  const incoming = mockIncomingOrder();
  const queue = mockQueue();
  const pendingCount = hasArrived ? 1 : 0;
  const counts = { preparing: queue.filter((o) => o.status === "preparing").length, ready: queue.filter((o) => o.status === "ready").length };
  const translateY = arrive.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] });

  return (
    <SceneFrame workspace="operations" activeTab="dashboard">
      <ScreenHeader
        title={storeName}
        subtitle={`${greeting()} · Main branch`}
        leading={
          <CoachTarget active={phase === "views" && !isSwitcherOpen}>
            <MockViewChip workspace="operations" onPress={phase === "views" ? () => setIsSwitcherOpen(true) : undefined} />
          </CoachTarget>
        }
        actions={
          <>
            <IconButton icon="printer" label="Printer" onPress={() => {}} dot={colors.success} />
            <IconButton icon="account" label="Account" onPress={() => {}} />
            <CoachTarget active={phase === "header"}>
              <IconButton icon="qr" label="Scan QR" tone="primary" onPress={phase === "header" ? onTried : () => {}} />
            </CoachTarget>
          </>
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <PeriodSelector periods={PERIODS} selected={period} onSelect={setPeriod} />
        <HeroRevenueCard
          revenue={MOCK_TODAY.revenue}
          orderCount={MOCK_TODAY.orderCount}
          avgOrder={MOCK_TODAY.avgOrder}
          periodLabel="Today"
          isLive={period === "today"}
        />
        <View style={styles.stats}>
          <StatCard value={MOCK_TODAY.activeNow + pendingCount} label="Active now" hint="In the queue" />
          <StatCard value={MOCK_TODAY.delivered} label="Delivered" hint="Today" />
        </View>
        <SectionHeader title="Order Queue" actionLabel="View all" onAction={() => {}} />
        <StatusPipeline
          stages={[
            { key: "pending", label: "Pending", count: pendingCount },
            { key: "confirmed", label: "Confirmed", count: 0 },
            { key: "preparing", label: "Preparing", count: counts.preparing },
            { key: "ready", label: "Ready", count: counts.ready },
          ]}
        />
        <SectionHeader
          title="Needs Attention"
          trailing={pendingCount ? <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View> : undefined}
        />
        {hasArrived ? (
          <Animated.View style={{ opacity: arrive, transform: [{ translateY }] }}>
            {phase === "arrive" ? (
              <View style={styles.toastWrap}>
                <MockToast icon="orders" text={`New order · ${incoming.customerName}`} />
              </View>
            ) : null}
            <CoachTarget active={phase === "arrive"} padding={4}>
              <OrderCard order={incoming} compact onPress={phase === "arrive" ? onTried : () => {}} />
            </CoachTarget>
          </Animated.View>
        ) : (
          <EmptyState message="You're all caught up — no pending orders" inset />
        )}
      </ScrollView>

      {isSwitcherOpen ? (
        <MockSheet title="Switch view" hint="Each view keeps its own tabs at the bottom of the screen.">
          {WORKSPACES.filter((w) => w.key !== "business").map((w, i, arr) => (
            <CoachTarget key={w.key} active={w.key === "register"} padding={2}>
              <ListRow
                icon={WORKSPACE_ICONS[w.key]}
                title={w.label}
                subtitle={`${w.description} · ${w.tabs.filter((t) => t !== "payments" && t !== "scheduled" && t !== "customer-hub").map(tabLabel).join(" · ")}`}
                isActive={w.key === "operations"}
                onPress={w.key === "register" ? () => { setIsSwitcherOpen(false); onTried(); } : () => setIsSwitcherOpen(false)}
                grouped={i < arr.length - 1}
              />
            </CoachTarget>
          ))}
          <View style={styles.sheetFoot}>
            <Icon name="menu" size={14} color={colors.textSecondary} />
            <Text style={styles.sheetFootText}>See every screen in Menu</Text>
          </View>
        </MockSheet>
      ) : null}
      {phase === "menu" ? <MenuTabSpotlight onTried={onTried} /> : null}
    </SceneFrame>
  );
}

/** Re-draws the bar over the frame's so the Menu tab can be the target. */
function MenuTabSpotlight({ onTried }: { onTried: () => void }) {
  return (
    <View style={styles.barOverlay} pointerEvents="box-none">
      <MockTabBar workspace="operations" activeTab="dashboard" targetTab="menu" onTab={(tab) => tab === "menu" && onTried()} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  stats: { flexDirection: "row", gap: spacing.md },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { ...typography.small, fontWeight: "800", color: colors.textOnDark },
  toastWrap: { marginBottom: spacing.sm },
  sheetFoot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingTop: spacing.md },
  sheetFootText: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  barOverlay: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
