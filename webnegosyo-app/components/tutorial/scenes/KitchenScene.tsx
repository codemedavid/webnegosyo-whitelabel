import React, { useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { TicketCard } from "../../kitchen/TicketCard";
import { CoachTarget } from "../spotlight";
import { mockKitchenTicket } from "../../../lib/tutorial/mock-data";
import { MockViewChip, SceneFrame, type SceneProps } from "./shared";

/** The kitchen board with the tour's order as its one ticket. */

export function KitchenScene({ phase, tried, onTried }: SceneProps) {
  const [ticket, setTicket] = useState(() => mockKitchenTicket());
  const [isBumped, setIsBumped] = useState(false);
  const fly = useRef(new Animated.Value(0)).current;

  const bump = () => {
    if (phase !== "bump") return;
    Animated.timing(fly, { toValue: 1, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setIsBumped(true);
      onTried();
    });
  };

  const setPrepTime = (_id: string, minutes: number) => {
    setTicket((t) => ({
      ...t,
      order: { ...t.order, prepMinutes: minutes, promisedReadyAt: new Date(Date.now() + minutes * 60_000).toISOString() },
    }));
    if (phase === "ticket") onTried();
  };

  const translateX = fly.interpolate({ inputRange: [0, 1], outputRange: [0, 420] });
  const opacity = fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <SceneFrame workspace="operations" activeTab="kitchen" tone="dark">
      <ScreenHeader
        title="Kitchen"
        subtitle={isBumped ? "0 open" : "1 open"}
        tone="dark"
        style={styles.header}
        leading={<MockViewChip workspace="operations" />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {isBumped ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyBody}>Confirmed orders appear here the moment they land.</Text>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ translateX }], opacity }}>
            <CoachTarget active={!tried} padding={4}>
              <TicketCard
                ticket={ticket}
                isNew={false}
                onBump={bump}
                onPrint={() => {}}
                canPrint
                canSetPrepTime
                onSetPrepTime={setPrepTime}
              />
            </CoachTarget>
          </Animated.View>
        )}
      </ScrollView>
      {isBumped ? (
        <TouchableOpacity style={styles.recall} accessibilityRole="button" accessibilityLabel="Recall — back to preparing">
          <Text style={styles.recallText}>Recall #4F2A — back to preparing</Text>
        </TouchableOpacity>
      ) : null}
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.heroInk },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 },
  empty: { alignItems: "center", paddingVertical: spacing.xxl * 2, gap: spacing.xs },
  emptyTitle: { ...typography.title, color: colors.heroInkText },
  emptyBody: { ...typography.body, color: colors.heroInkMuted },
  recall: { marginHorizontal: spacing.xl, marginBottom: spacing.md, backgroundColor: colors.heroInkElevated, borderRadius: radius.md, padding: spacing.lg, alignItems: "center" },
  recallText: { ...typography.body, fontWeight: "700", color: colors.tabBarActive },
});
