import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { platformActivityClient } from "../../lib/activity/activity-client";
import { useOrderActivity } from "../../lib/activity/use-activity-summary";
import { colors, spacing, typography } from "../../theme/colors";
import { Card } from "../Card";
import { OrderHistoryTimeline } from "./OrderHistoryTimeline";

interface OrderHistoryCardProps {
  tenantId: string | null;
  orderId: string;
  /** When the order was placed (ISO); bounds the read. */
  placedAt: string | null;
}

/**
 * "History" on the order screen: every recorded change to this order from
 * Store Activity (subject_type 'order'). Shows nothing on a database that has
 * not got Store Activity yet, so the screen is unchanged until it lands.
 */
export function OrderHistoryCard({ tenantId, orderId, placedAt }: OrderHistoryCardProps) {
  const history = useOrderActivity(tenantId ? { tenantId, orderId, placedAt } : null, { client: platformActivityClient });

  if (!tenantId || history.isUnavailable) return null;

  const body = (() => {
    if (history.isLoading) return <Text style={styles.muted}>Loading history…</Text>;
    if (history.error) {
      return (
        <View style={styles.errorRow}>
          <Text style={styles.muted}>{"Couldn't load this order's history."}</Text>
          <TouchableOpacity onPress={() => void history.refetch()} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (history.events.length === 0) {
      return (
        <Text style={styles.muted}>
          {"Nothing recorded for this order yet. Changes made before Store Activity started weren't recorded."}
        </Text>
      );
    }
    return <OrderHistoryTimeline events={history.events} />;
  })();

  return (
    <Card title="History" style={styles.card}>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  muted: { ...typography.caption, color: colors.textMuted },
  errorRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  retry: { minHeight: 44, justifyContent: "center" },
  retryText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, textDecorationLine: "underline" },
});
