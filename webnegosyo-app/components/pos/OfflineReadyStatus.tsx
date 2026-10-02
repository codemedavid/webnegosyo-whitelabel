/**
 * The register's offline copy, in one tappable line.
 *
 * Tells the cashier whether this device can sell without internet (and from
 * how old a menu), and is the button that saves or refreshes that copy. The
 * copy is also saved on its own (`useOfflinePackAutoSync`); this is the way to
 * see it and to force it before the connection goes.
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, typography } from "../../theme/colors";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { useOfflinePack, useRegisterPackScope } from "../../lib/offline/use-offline-pack";
import { offlineReadyStatus, type OfflineReadyTone } from "../../lib/offline/offline-ready-text";

/** The "saved 5 min ago" wording is re-read this often. */
const AGE_TICK_MS = 60_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const TONE_STYLE: Record<OfflineReadyTone, { dot: string; text: string }> = {
  ok: { dot: colors.success, text: colors.textSecondary },
  neutral: { dot: colors.textTertiary, text: colors.textSecondary },
  warning: { dot: colors.warning, text: colors.textPrimary },
};

export function OfflineReadyStatus() {
  const scope = useRegisterPackScope();
  const pack = useOfflinePack(scope);
  const { status: connection } = useConnectivity();
  const now = useNow(AGE_TICK_MS);

  const status = offlineReadyStatus({
    isLoaded: pack.isLoaded,
    isDownloading: pack.isDownloading,
    isOffline: connection === "offline",
    lastFailed: pack.lastFailed,
    manifest: pack.manifest,
    now,
  });
  if (scope === null || status === null) return null;

  const tone = TONE_STYLE[status.tone];
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.text, { color: tone.text }]} numberOfLines={2}>
        {status.text}
      </Text>
      {status.actionLabel !== null && (
        <TouchableOpacity
          onPress={pack.download}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${status.actionLabel} — save the menu and payment methods on this device`}
        >
          <Text style={styles.action}>{status.actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { ...typography.caption, flex: 1 },
  action: { ...typography.caption, fontWeight: "700", color: colors.accent },
});
