import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../../theme/colors";
import { Icon } from "../Icon";
import type { PublishStatus } from "../../hooks/useReceiptStudio";
import { studio } from "./studio-theme";

/**
 * The editor's top bar, on the studio's dark ink: back, the receipt's state in
 * one line, Undo, and Publish.
 *
 * Publish is the only coral thing in the bar and only while there is
 * something to publish; once the paper matches the store it steps back to a
 * quiet "Live", so the merchant can tell at a glance whether what they see is
 * what the counter prints.
 */

export interface HeaderStatus {
  text: string;
  tone: "live" | "dirty" | "muted";
}

interface StudioHeaderProps {
  status: HeaderStatus;
  canUndo: boolean;
  canPublish: boolean;
  publishStatus: PublishStatus;
  onBack: () => void;
  onUndo: () => void;
  onPublish: () => void;
}

const DOT_COLORS: Record<HeaderStatus["tone"], string> = {
  live: studio.live,
  dirty: studio.dirty,
  muted: studio.canvasMuted,
};

function PublishButton({
  canPublish,
  publishStatus,
  onPublish,
}: Pick<StudioHeaderProps, "canPublish" | "publishStatus" | "onPublish">) {
  if (publishStatus === "publishing") {
    return (
      <View style={[styles.publish, styles.publishActive]} accessibilityLabel="Publishing">
        <ActivityIndicator size="small" color={colors.textOnDark} />
      </View>
    );
  }
  if (publishStatus === "published") {
    return (
      <View style={[styles.publish, styles.publishDone]} accessibilityLabel="Published">
        <Icon name="check" size={15} color={studio.canvas} strokeWidth={2.5} />
        <Text style={[styles.publishText, styles.publishDoneText]}>Live</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPublish}
      disabled={!canPublish}
      activeOpacity={0.8}
      style={[styles.publish, canPublish ? styles.publishActive : styles.publishIdle]}
      accessibilityRole="button"
      accessibilityLabel="Publish receipt"
      accessibilityHint="Every receipt from now on prints this design"
      accessibilityState={{ disabled: !canPublish }}
    >
      <Text style={[styles.publishText, !canPublish && styles.publishIdleText]}>Publish</Text>
    </TouchableOpacity>
  );
}

export function StudioHeader({
  status,
  canUndo,
  canPublish,
  publishStatus,
  onBack,
  onUndo,
  onPublish,
}: StudioHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.round}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Icon name="back" size={21} color={studio.canvasText} />
      </TouchableOpacity>

      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header">
          Receipt
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: DOT_COLORS[status.tone] }]} />
          <Text style={styles.status} numberOfLines={1}>
            {status.text}
          </Text>
        </View>
      </View>

      {canUndo ? (
        <TouchableOpacity
          onPress={onUndo}
          style={styles.round}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Undo last change"
        >
          <Icon name="undo" size={20} color={studio.canvasText} />
        </TouchableOpacity>
      ) : null}

      <PublishButton canPublish={canPublish} publishStatus={publishStatus} onPublish={onPublish} />
    </View>
  );
}

const ROUND = 44;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: studio.canvas,
  },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: studio.canvasRaised,
  },
  copy: { flex: 1, marginLeft: spacing.xs },
  title: { fontSize: 19, fontWeight: "800", letterSpacing: -0.2, color: studio.canvasText },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { flex: 1, fontSize: 12.5, fontWeight: "600", color: studio.canvasMuted },
  publish: {
    height: ROUND,
    minWidth: 92,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  publishActive: { backgroundColor: colors.accent },
  publishIdle: { backgroundColor: studio.canvasRaised },
  publishDone: { backgroundColor: studio.live },
  publishText: { fontSize: 15, fontWeight: "800", color: colors.textOnDark },
  publishIdleText: { color: studio.canvasMuted },
  publishDoneText: { color: studio.canvas },
});
