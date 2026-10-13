import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { formatManilaTime } from "../../lib/activity/format";
import { OWL_IMAGE } from "./owl-image";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import { Icon } from "../Icon";


interface StaleBannerProps {
  /** Epoch ms of the rows on screen. */
  dataUpdatedAt: number;
  isOffline: boolean;
  onRetry: () => void;
}

/**
 * Above the list when a refresh failed or the phone is offline. The rows stay;
 * the banner says how old they are (spec §3 shared states, §4 errors).
 */
export function StaleBanner({ dataUpdatedAt, isOffline, onRetry }: StaleBannerProps) {
  const at = dataUpdatedAt > 0 ? formatManilaTime(new Date(dataUpdatedAt).toISOString()) : null;
  const message = isOffline
    ? `You're offline. Showing activity up to ${at ?? "the last refresh"}.`
    : `Couldn't refresh. Showing what we had at ${at ?? "the last refresh"}.`;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon name="info" size={16} color={colors.textPrimary} />
      <Text style={styles.bannerText}>{message}</Text>
      {isOffline ? null : <Button label="Try again" onPress={onRetry} tone="ghost" size="sm" />}
    </View>
  );
}

/** "Your activity": a staff member without the store view sees only their own. */
export function OwnActivityNote() {
  return (
    <View style={styles.note}>
      <Icon name="account" size={16} color={colors.textMuted} />
      <Text style={styles.noteText}>{"You're seeing your own activity."}</Text>
    </View>
  );
}

interface FeedEmptyProps {
  variant: "quiet" | "filtered" | "all_clear" | "own";
  onClearFilters?: () => void;
}

/**
 * The feed's empty states. The Owl appears ONLY on the all-clear state
 * (spec §6): never beside a flag, an error or someone's numbers.
 */
export function FeedEmpty({ variant, onClearFilters }: FeedEmptyProps) {
  if (variant === "all_clear") {
    return (
      <View style={styles.allClear}>
        <Image source={OWL_IMAGE} alt="" style={styles.owl} accessibilityIgnoresInvertColors accessible={false} />
        <Text style={styles.allClearTitle}>All clear. Nothing needs a look.</Text>
        <Text style={styles.allClearText}>
          {"We'll flag anything unusual, like a paid order cancelled or a drawer off by more than ₱100."}
        </Text>
      </View>
    );
  }
  if (variant === "filtered") {
    return (
      <EmptyState
        icon="search"
        title="Nothing matches"
        message="Try a longer period or fewer filters."
        actionLabel={onClearFilters ? "Clear filters" : undefined}
        onAction={onClearFilters}
      />
    );
  }
  if (variant === "own") {
    return (
      <EmptyState
        icon="list"
        title="Quiet so far"
        message="Things you do, like refunds, cancels and stock changes, show up here."
      />
    );
  }
  return (
    <EmptyState
      icon="list"
      title="Quiet so far"
      message="Refunds, cancels, stock changes and drawer counts will show up here as they happen."
    />
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
  },
  bannerText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  noteText: { ...typography.caption, color: colors.textMuted },
  allClear: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.xs },
  owl: { width: 72, height: 72, marginBottom: spacing.sm },
  allClearTitle: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  allClearText: { ...typography.body, color: colors.textMuted, textAlign: "center", maxWidth: 300 },
});
