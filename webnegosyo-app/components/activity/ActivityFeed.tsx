import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";

import { buildFeedItems, type FeedItem } from "../../lib/activity/feed-groups";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { colors, spacing } from "../../theme/colors";
import { ActivityDayHeader } from "./ActivityDayHeader";
import { ActivityEventRow, STACKED_FONT_SCALE } from "./ActivityEventRow";
import { RollupRow } from "./RollupRow";

interface ActivityFeedProps {
  events: readonly StoreActivityEvent[];
  nowIso: string;
  expandedRollups: ReadonlySet<string>;
  showBranch: boolean;
  canReview: boolean;
  isRefreshing: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  header?: React.ReactElement;
  empty: React.ReactElement;
  onRefresh: () => void;
  onEndReached: () => void;
  onOpenEvent: (event: StoreActivityEvent) => void;
  onMarkReviewed?: (event: StoreActivityEvent) => void;
  onToggleRollup: (key: string) => void;
}

const keyOf = (item: FeedItem): string => item.key;

/**
 * The windowed feed: [day header, rows, roll-ups, day header, …] with the day
 * headers sticky. RN FlatList guidance for low-end Android: memoised rows,
 * stable keys, small batches; no images in rows (spec §3.1 Performance).
 */
export function ActivityFeed({
  events,
  nowIso,
  expandedRollups,
  showBranch,
  canReview,
  isRefreshing,
  isFetchingMore,
  hasMore,
  header,
  empty,
  onRefresh,
  onEndReached,
  onOpenEvent,
  onMarkReviewed,
  onToggleRollup,
}: ActivityFeedProps) {
  const { fontScale } = useWindowDimensions();
  const items = useMemo(() => buildFeedItems(events, { nowIso, expanded: expandedRollups }), [events, nowIso, expandedRollups]);
  // Offset by one when a list header sits above the first day header.
  const headerOffset = header ? 1 : 0;
  const stickyIndices = useMemo(
    () => items.flatMap((item, index) => (item.type === "day" ? [index + headerOffset] : [])),
    [items, headerOffset],
  );

  const renderItem = useCallback<ListRenderItem<FeedItem>>(
    ({ item }) => {
      if (item.type === "day") return <ActivityDayHeader label={item.label} summary={item.summary} isAllClear={item.isAllClear} />;
      if (item.type === "rollup") return <RollupRow item={item} onToggle={onToggleRollup} />;
      return (
        <ActivityEventRow
          event={item.event}
          showBranch={showBranch}
          canReview={canReview}
          onPress={onOpenEvent}
          onMarkReviewed={onMarkReviewed}
        />
      );
    },
    [showBranch, canReview, onOpenEvent, onMarkReviewed, onToggleRollup],
  );

  const handleEnd = useCallback(() => {
    if (hasMore && !isFetchingMore) onEndReached();
  }, [hasMore, isFetchingMore, onEndReached]);

  return (
    <FlatList
      data={items}
      keyExtractor={keyOf}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={isFetchingMore ? <ActivityIndicator style={styles.footer} color={colors.textMuted} /> : null}
      stickyHeaderIndices={fontScale < STACKED_FONT_SCALE ? stickyIndices : undefined}
      ItemSeparatorComponent={Separator}
      onEndReached={handleEnd}
      onEndReachedThreshold={0.5}
      initialNumToRender={10}
      windowSize={7}
      maxToRenderPerBatch={8}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      contentContainerStyle={styles.content}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl * 3 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  footer: { paddingVertical: spacing.lg },
});
