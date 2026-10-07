import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import type { InsightsState } from "../../lib/customer-hub/insights-state";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";

type NoticeState = Extract<InsightsState, "off" | "pending_update" | "error">;

const COPY: Record<NoticeState, { icon: IconName; title: string; message: string }> = {
  off: {
    icon: "customers",
    title: "Customer insights aren't on for this store yet",
    message: "They switch on once this store's order history has been checked. Your sales are here in the meantime.",
  },
  pending_update: {
    icon: "customers",
    title: "Customer insights are almost here",
    message:
      "Who your regulars are, what they bring in and who to bring back will appear here after the next platform update.",
  },
  error: {
    icon: "warning",
    title: "Customer figures could not be loaded",
    message: "Check the connection and try again. Your other reports still work.",
  },
};

interface InsightsNoticeProps {
  state: NoticeState;
  onRetry?: () => void;
}

/**
 * A card, not a full screen: when customer figures are missing the rest of the
 * page still has something to say, so the notice takes one row of it rather
 * than the whole first screenful.
 */
export function InsightsNotice({ state, onRetry }: InsightsNoticeProps) {
  const copy = COPY[state];
  const isError = state === "error";
  return (
    <View style={styles.card}>
      <View style={[styles.iconTile, isError && styles.iconTileError]}>
        <Icon name={copy.icon} size={20} color={isError ? colors.danger : colors.accent} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.message}>{copy.message}</Text>
        {isError && onRetry ? (
          <Button label="Try again" onPress={onRetry} tone="secondary" size="sm" fullWidth={false} style={styles.retry} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  iconTileError: { backgroundColor: colors.dangerLight },
  copy: { flex: 1, gap: spacing.xs },
  title: { ...typography.heading, color: colors.textPrimary },
  message: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
  retry: { alignSelf: "flex-start", marginTop: spacing.sm },
});
