import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { WELCOME_COLORS } from "../../lib/welcome/slides";
import { Rise } from "./Rise";
import { sceneStyles } from "./scene-styles";
import { useAfter } from "./use-after";

/** The new order lands at this moment: the notification, the row and the count. */
const NEW_ORDER_AT_MS = 2300;

interface OrderRow {
  ref: string;
  status: string;
  total: string;
  dot: string;
  delay: number;
}

const EARLIER_ORDERS: readonly OrderRow[] = [
  { ref: "#26 · Table 4", status: "Preparing", total: "₱385", dot: WELCOME_COLORS.yellow, delay: 300 },
  { ref: "#25 · Pickup", status: "Ready", total: "₱240", dot: "#2FA35B", delay: 550 },
  { ref: "#24 · Table 2", status: "Paid", total: "₱1,120", dot: "#C9C9C9", delay: 850 },
];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OWL_ICON = require("../../assets/welcome/owl-icon.png");

function LiveDot({ isReducedMotion }: { isReducedMotion: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isReducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [isReducedMotion, pulse]);
  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  };
  return (
    <View style={styles.liveDot}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.liveRing, ringStyle]} />
    </View>
  );
}

export function OrdersScene({ isReducedMotion }: { isReducedMotion: boolean }) {
  const hasNewOrder = useAfter(NEW_ORDER_AT_MS, isReducedMotion);

  return (
    <View style={sceneStyles.stage}>
      <Rise delay={NEW_ORDER_AT_MS} motion="drop" isReducedMotion={isReducedMotion} style={styles.notification}>
        <Image source={OWL_ICON} alt="" style={styles.appIcon} accessibilityIgnoresInvertColors />
        <View style={styles.notificationText}>
          <View style={styles.notificationMeta}>
            <Text style={styles.notificationApp}>SmartMenu</Text>
            <Text style={styles.notificationApp}>now</Text>
          </View>
          <Text style={sceneStyles.rowStrong}>New order #27 · ₱520</Text>
          <Text style={styles.notificationBody} numberOfLines={1}>
            Delivery · 2× Chicken Inasal, 1× Iced Tea
          </Text>
        </View>
      </Rise>

      <Rise delay={100} isReducedMotion={isReducedMotion} style={[sceneStyles.card, styles.ordersCard]}>
        <View style={styles.headerRow}>
          <Text style={sceneStyles.label}>Today’s orders</Text>
          <View style={styles.live}>
            <LiveDot isReducedMotion={isReducedMotion} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
        <Text style={sceneStyles.bigNumber}>{hasNewOrder ? "27" : "26"}</Text>

        <Rise delay={NEW_ORDER_AT_MS} motion="drop" isReducedMotion={isReducedMotion} style={[styles.row, styles.newRow]}>
          <View style={[styles.dot, { backgroundColor: WELCOME_COLORS.red }]} />
          <Text style={[sceneStyles.rowStrong, styles.grow]}>#27 · Delivery</Text>
          <Text style={styles.newBadge}>NEW</Text>
          <Text style={[sceneStyles.rowStrong, styles.total]}>₱520</Text>
        </Rise>
        {EARLIER_ORDERS.map((order) => (
          <Rise key={order.ref} delay={order.delay} motion="right" isReducedMotion={isReducedMotion} style={[styles.row, styles.divided]}>
            <View style={[styles.dot, { backgroundColor: order.dot }]} />
            <Text style={[sceneStyles.rowTitle, styles.grow]}>{order.ref}</Text>
            <Text style={sceneStyles.rowMeta}>{order.status}</Text>
            <Text style={[sceneStyles.rowTitle, styles.total]}>{order.total}</Text>
          </Rise>
        ))}
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  notification: {
    position: "absolute",
    top: 20,
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  appIcon: { width: 40, height: 40, borderRadius: 11 },
  notificationText: { flex: 1, minWidth: 0, gap: 1 },
  notificationMeta: { flexDirection: "row", justifyContent: "space-between" },
  notificationApp: { fontSize: 12, fontWeight: "600", color: "#6B6B6B" },
  notificationBody: { fontSize: 13, color: "#4A4A4A" },
  ordersCard: { top: 112, paddingBottom: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  live: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: WELCOME_COLORS.red },
  liveRing: { borderRadius: 4, backgroundColor: WELCOME_COLORS.red },
  liveText: { fontSize: 12, fontWeight: "700", color: WELCOME_COLORS.red },
  row: { flexDirection: "row", alignItems: "center", gap: 10, height: 52 },
  newRow: { marginHorizontal: -10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "#FFF0F0", marginTop: 8 },
  divided: { borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grow: { flex: 1 },
  total: { width: 58, textAlign: "right" },
  newBadge: {
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    backgroundColor: WELCOME_COLORS.red,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
});
