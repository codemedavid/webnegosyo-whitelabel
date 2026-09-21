/**
 * Tells the cashier what the register is doing about the connection.
 *
 * Renders only when there is something to say: the shop is offline (sales
 * are being kept on this device), sales taken offline are still waiting to
 * reach the server, or a sale the server refused needs a person. Silent the
 * rest of the time, so a working register looks exactly as it did before.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/colors";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { usePendingSaleCounts, type PendingSaleCounts } from "../../lib/offline/use-outbox-sync";
import { offlineBannerText } from "../../lib/offline/banner-text";

type Tone = "offline" | "syncing" | "attention";

function toneFor(status: string, counts: PendingSaleCounts): Tone {
  if (status === "offline") return "offline";
  return counts.stuck > 0 && counts.pending === 0 ? "attention" : "syncing";
}

export function OfflineBanner() {
  const { status } = useConnectivity();
  const counts = usePendingSaleCounts();
  const text = offlineBannerText(status, counts);
  if (text === null) return null;

  return (
    <View
      style={[styles.bar, styles[toneFor(status, counts)]]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.label} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  offline: { backgroundColor: colors.warningLight },
  syncing: { backgroundColor: colors.statusReady.bg },
  attention: { backgroundColor: colors.statusPreparing.bg },
  label: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
});
