import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from "react-native";
import { FunctionReference } from "convex/server";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useSafeQuery } from "../lib/hooks";
import { useAuthStore } from "../stores/auth-store";
import { filterOrdersToScope } from "../lib/branch-scope";
import { useBranchScope } from "../lib/use-branch-scope";
import { useTabVisibilityContext } from "../lib/use-tab-visibility-context";
import {
  detectKitchenConfirmations,
  formatKitchenConfirmation,
  shouldShowKitchenConfirmations,
  type ConfirmableOrder,
  type KitchenConfirmationMessage,
} from "../lib/kitchen-confirm";
import { confirmedOnThisDevice } from "../lib/kitchen-confirm-local";
import { colors, spacing, radius, typography } from "../theme/colors";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chimeSource = require("../assets/kitchen-confirmed.wav");

const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;

/** Long enough to read across a counter, short enough not to pile up. */
const BANNER_DISMISS_MS = 6_000;
const VIBRATE_MS = 200;

interface QueuedBanner extends KitchenConfirmationMessage {
  orderId: string;
}

/**
 * "Kitchen confirmed #07" for the counter. Watches the same live queue as the
 * ringtone (the query is shared, so no extra backend reads) and, when an order
 * goes from waiting on the kitchen to the kitchen having it, shows a banner
 * that never blocks the register — no dialog mid-sale — plus a short chime.
 *
 * Silent for kitchen-only staff, in the demo, on the Kitchen screen itself
 * and for this device's own taps (lib/kitchen-confirm-local.ts). Like every
 * in-app alert it needs the app open; a backgrounded phone hears nothing.
 */
export function GlobalKitchenConfirmAlerts() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const { caller } = useTabVisibilityContext();
  const isAudience = shouldShowKitchenConfirmations({ convexUrl, orderBackend, isDemo, caller });

  const { data: queue } = useSafeQuery<Record<string, ConfirmableOrder[] | undefined>>(getRealtimeQueueRef);
  const scope = useBranchScope();
  const pathname = usePathname();
  const isOnKitchenBoard = pathname.endsWith("/kitchen");

  const orders = useMemo(
    () =>
      queue
        ? Object.values(queue).flatMap((bucket) =>
            Array.isArray(bucket) ? [...filterOrdersToScope(scope, bucket)] : [],
          )
        : undefined,
    [queue, scope],
  );

  const statusesRef = useRef<ReadonlyMap<string, string> | null>(null);
  const [banners, setBanners] = useState<readonly QueuedBanner[]>([]);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        // Already released.
      }
      playerRef.current = null;
    };
  }, []);

  const chime = useCallback(() => {
    try {
      if (!playerRef.current) playerRef.current = createAudioPlayer(chimeSource);
      Promise.resolve(playerRef.current.seekTo(0)).catch(() => {});
      playerRef.current.play();
    } catch {
      // Best-effort; the banner still shows.
    }
    Vibration.vibrate(VIBRATE_MS);
  }, []);

  useEffect(() => {
    // The scan keeps running while silenced, so leaving the Kitchen screen
    // does not replay everything confirmed while it was open.
    const scan = detectKitchenConfirmations(statusesRef.current, orders, confirmedOnThisDevice());
    statusesRef.current = scan.statuses;
    if (!isAudience || isOnKitchenBoard || scan.confirmed.length === 0) return;

    const fresh = scan.confirmed.map((order) => ({ orderId: order._id, ...formatKitchenConfirmation(order) }));
    setBanners((prev) => [...prev.filter((b) => !fresh.some((f) => f.orderId === b.orderId)), ...fresh]);
    chime();
  }, [orders, isAudience, isOnKitchenBoard, chime]);

  const current = banners[0];
  const dismiss = useCallback(() => setBanners((prev) => prev.slice(1)), []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(dismiss, BANNER_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  if (!isAudience || !current) return null;

  return (
    <KitchenConfirmBanner
      banner={current}
      moreCount={banners.length - 1}
      onOpen={() => {
        dismiss();
        router.push(`/(main)/order/${current.orderId}`);
      }}
      onDismiss={dismiss}
    />
  );
}

interface KitchenConfirmBannerProps {
  banner: QueuedBanner;
  moreCount: number;
  onOpen: () => void;
  onDismiss: () => void;
}

function KitchenConfirmBanner({ banner, moreCount, onOpen, onDismiss }: KitchenConfirmBannerProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      <TouchableOpacity
        style={styles.banner}
        onPress={onOpen}
        activeOpacity={0.9}
        accessibilityRole="alert"
        accessibilityLabel={`${banner.title}. ${banner.body}. Opens the order.`}
      >
        <View style={styles.check}>
          <Text style={styles.checkText}>✓</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={styles.body} numberOfLines={1}>
            {moreCount > 0 ? `${banner.body} · +${moreCount} more` : banner.body}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Text style={styles.close}>×</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 1000,
    elevation: 12,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  check: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: { color: colors.textOnDark, fontSize: 17, fontWeight: "800" },
  copy: { flex: 1 },
  title: { ...typography.heading, color: colors.heroInkText },
  body: { ...typography.caption, color: colors.heroInkMuted, marginTop: 2 },
  close: { color: colors.heroInkMuted, fontSize: 22, fontWeight: "600", paddingHorizontal: spacing.xs },
});
