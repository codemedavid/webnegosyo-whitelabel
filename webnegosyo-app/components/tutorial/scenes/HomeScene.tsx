import React, { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography, radius, shadow } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { IconButton } from "../../IconButton";
import { HeroRevenueCard } from "../../HeroRevenueCard";
import { QuickActions } from "../../QuickActions";
import { SectionHeader } from "../../SectionHeader";
import { StatusPipeline } from "../../StatusPipeline";
import { OrderCard } from "../../OrderCard";
import { EmptyState } from "../../EmptyState";
import { CoachTarget } from "../spotlight";
import { MOCK_TODAY, mockIncomingOrder, mockQueue } from "../../../lib/tutorial/mock-data";
import { QUICK_ACTIONS } from "../../../lib/home-quick-actions";
import { MockTabBar, MockToast, SceneFrame, useSceneStoreName, type SceneProps } from "./shared";
import { MenuScene } from "./MenuScene";
import { OrderDetailScene } from "./OrderDetailScene";
import { RegisterScene } from "./RegisterScene";
import { ToolsScene } from "./ToolsScene";

/**
 * Home, as the merchant will see it on their first morning — set in their own
 * store, with the day's takings, the queue, and the order the tour follows.
 */
const ARRIVAL_DELAY_MS = 1400;

/** Yesterday, for the delta pill: a little under today so the tour opens on a good day. */
const MOCK_DELTA = 0.12;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeScene({ phase, tried, onTried }: SceneProps) {
  const storeName = useSceneStoreName();
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
  if (tried && phase === "bar") return <RegisterScene phase="browse" tried={false} onTried={() => {}} />;
  if (tried && phase === "menu") return <MenuScene />;
  if (tried && phase === "header") return <ToolsScene phase="camera" tried={false} onTried={() => {}} />;
  if (tried && phase === "arrive") return <OrderDetailScene phase="view" tried={false} onTried={() => {}} />;

  const incoming = mockIncomingOrder();
  const queue = mockQueue();
  const pendingCount = hasArrived ? 1 : 0;
  const counts = { preparing: queue.filter((o) => o.status === "preparing").length, ready: queue.filter((o) => o.status === "ready").length };
  const activeCount = pendingCount + counts.preparing + counts.ready;
  const translateY = arrive.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] });

  return (
    <SceneFrame activeTab="dashboard">
      <ScreenHeader
        title={storeName}
        subtitle={`${greeting()} · Main branch`}
        actions={
          <>
            <IconButton icon="printer" label="Printer" onPress={() => {}} dot={colors.success} />
            <CoachTarget active={phase === "header"}>
              <IconButton icon="qr" label="Scan QR" tone="primary" onPress={phase === "header" ? onTried : () => {}} />
            </CoachTarget>
          </>
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <HeroRevenueCard
          revenue={MOCK_TODAY.revenue}
          orderCount={MOCK_TODAY.orderCount}
          avgOrder={MOCK_TODAY.avgOrder}
          periodLabel="Today"
          isLive
          delta={MOCK_DELTA}
          comparisonLabel="yesterday"
        />
        <QuickActions actions={QUICK_ACTIONS} onPress={() => {}} />
        <SectionHeader
          title="Orders now"
          hint={`${activeCount} in the queue`}
          actionLabel="See all"
          onAction={() => {}}
          style={styles.firstSection}
        />
        <StatusPipeline
          stages={[
            { key: "pending", label: "Pending", count: pendingCount },
            { key: "confirmed", label: "Confirmed", count: 0 },
            { key: "preparing", label: "Preparing", count: counts.preparing },
            { key: "ready", label: "Ready", count: counts.ready },
          ]}
        />
        <SectionHeader
          title="Needs attention"
          hint="Oldest pending orders first"
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

      {phase === "bar" ? <BarTabSpotlight target="pos" onTried={onTried} /> : null}
      {phase === "menu" ? <BarTabSpotlight target="menu" onTried={onTried} /> : null}
    </SceneFrame>
  );
}

/** Re-draws the bar over the frame's so one tab can be the target. */
function BarTabSpotlight({ target, onTried }: { target: string; onTried: () => void }) {
  return (
    <View style={styles.barOverlay} pointerEvents="box-none">
      <MockTabBar activeTab="dashboard" targetTab={target} onTab={(tab) => tab === target && onTried()} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  firstSection: { marginTop: spacing.sm },
  badge: { minWidth: 22, height: 22, borderRadius: radius.full, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, ...shadow.sm },
  badgeText: { ...typography.small, fontWeight: "800", color: colors.textOnDark },
  toastWrap: { marginBottom: spacing.sm },
  barOverlay: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
