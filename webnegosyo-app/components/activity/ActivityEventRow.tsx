import React, { memo, useCallback, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
} from "react-native";

import { describeActivity } from "../../lib/activity/describe";
import { formatManilaTime } from "../../lib/activity/format";
import { activityRowLabel } from "../../lib/activity/row-a11y";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { initialsOf } from "../../lib/staff-format";
import { colors, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { ACTIVITY_ICON_GLYPHS, actorMark, amountInk, tileLook } from "./activity-look";
import { FlagChip } from "./FlagChip";

/** At this font scale the right column moves under line 2 (spec §3.1). */
export const STACKED_FONT_SCALE = 1.3;
export const ACTIVITY_ROW_HEIGHT = 72;

interface ActivityEventRowProps {
  event: StoreActivityEvent;
  /** Add the branch to line 2 (viewing all branches). */
  showBranch: boolean;
  /** Offers "Mark reviewed" as an accessibility action on open flags. */
  canReview: boolean;
  onPress: (event: StoreActivityEvent) => void;
  onMarkReviewed?: (event: StoreActivityEvent) => void;
}

function ActorBadge({ event }: { event: StoreActivityEvent }) {
  const mark = actorMark(event);
  return (
    <View style={styles.badge}>
      {mark.kind === "customer" ? (
        <Icon name="account" size={10} color={colors.textPrimary} strokeWidth={2.25} />
      ) : (
        <Text style={styles.badgeText} allowFontScaling={false}>
          {mark.kind === "system" ? "SYS" : initialsOf(mark.name)}
        </Text>
      )}
    </View>
  );
}

/**
 * One activity row: who did what, how much, when (spec §3.1, P2). Two lines
 * at most at default size; a Check chip on an open flag; one accessible
 * element whose label is the whole sentence. No swipe, no long-press.
 */
function ActivityEventRowBase({ event, showBranch, canReview, onPress, onMarkReviewed }: ActivityEventRowProps) {
  const { fontScale } = useWindowDimensions();
  const isStacked = fontScale >= STACKED_FONT_SCALE;
  const described = useMemo(() => describeActivity(event, { showBranch }), [event, showBranch]);
  const look = tileLook(described.tone);
  const time = formatManilaTime(event.occurredAt);
  const hasFlag = event.flags.length > 0;
  const isOpenFlag = hasFlag && event.reviewedAt === null;
  const canMarkReviewed = canReview && isOpenFlag && onMarkReviewed !== undefined;

  const handlePress = useCallback(() => onPress(event), [onPress, event]);
  const handleAction = useCallback(
    (action: AccessibilityActionEvent) => {
      if (action.nativeEvent.actionName === "markReviewed") onMarkReviewed?.(event);
      else onPress(event);
    },
    [onMarkReviewed, onPress, event],
  );

  const figures = (
    <View style={isStacked ? styles.figuresStacked : styles.figures}>
      {described.amountLabel ? (
        <Text style={[styles.amount, { color: amountInk(described.tone) }]} numberOfLines={1}>
          {described.amountLabel}
        </Text>
      ) : null}
      <Text style={styles.time} numberOfLines={1}>
        {time}
      </Text>
    </View>
  );

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={activityRowLabel(event, described)}
      accessibilityActions={[
        { name: "activate" },
        ...(canMarkReviewed ? [{ name: "markReviewed", label: "Mark reviewed" }] : []),
      ]}
      onAccessibilityAction={handleAction}
    >
      <View style={[styles.tile, { backgroundColor: look.tint }]}>
        <Icon name={ACTIVITY_ICON_GLYPHS[described.icon]} size={19} color={look.ink} strokeWidth={2} />
        <ActorBadge event={event} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={isStacked ? 2 : 1}>
            {described.title}
          </Text>
          {hasFlag ? <FlagChip isReviewed={!isOpenFlag} /> : null}
        </View>
        {described.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={isStacked ? 2 : 1}>
            {described.subtitle}
          </Text>
        ) : null}
        {isStacked ? figures : null}
      </View>
      {isStacked ? null : figures}
    </Pressable>
  );
}

export const ActivityEventRow = memo(ActivityEventRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: ACTIVITY_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
  },
  pressed: { backgroundColor: colors.surfaceSubtle },
  tile: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 2,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.card,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 8, fontWeight: "800", color: colors.textPrimary },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  subtitle: { ...typography.caption, color: colors.textMuted },
  figures: { alignItems: "flex-end", gap: 2, maxWidth: 110 },
  figuresStacked: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  time: { fontSize: 12, color: colors.textMuted },
});
