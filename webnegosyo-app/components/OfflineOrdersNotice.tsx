/**
 * The order screens' line about the connection: offline (what is on screen
 * comes from this device), syncing (work still to be written), or a refusal
 * that needs a person. Renders nothing the rest of the time.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme/colors";
import { useAuthStore } from "../stores/auth-store";
import { usePendingSaleCounts, useOrderEdits } from "../lib/offline/use-outbox-sync";
import { isOrderEditStuck } from "../lib/offline/order-edits";
import { offlineOrdersNotice, type OfflineOrdersTone } from "../lib/offline/offline-orders-notice";

interface OfflineOrdersNoticeProps {
  isOffline: boolean;
  /** When the saved list on screen was last read live; null when it is live. */
  savedAt: number | null;
}

export function OfflineOrdersNotice({ isOffline, savedAt }: OfflineOrdersNoticeProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const sales = usePendingSaleCounts();
  const { edits } = useOrderEdits();
  const mine = edits.filter((edit) => edit.tenantId === tenantId);
  const stuckEdits = mine.filter(isOrderEditStuck).length;

  const notice = offlineOrdersNotice({
    isOffline,
    savedAt,
    now: Date.now(),
    waiting: sales.pending + mine.length - stuckEdits,
    stuck: sales.stuck + stuckEdits,
  });
  if (notice === null) return null;

  return (
    <View style={[styles.bar, TONE_STYLES[notice.tone]]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.label} numberOfLines={3}>
        {notice.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
  },
  offline: { backgroundColor: colors.warningLight },
  syncing: { backgroundColor: colors.statusReady.bg },
  attention: { backgroundColor: colors.dangerLight },
  label: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
});

const TONE_STYLES: Record<OfflineOrdersTone, object> = {
  offline: styles.offline,
  syncing: styles.syncing,
  attention: styles.attention,
};
