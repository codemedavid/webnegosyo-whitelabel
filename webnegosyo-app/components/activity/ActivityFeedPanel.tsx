import React, { useCallback, useState } from "react";
import { View } from "react-native";

import type { ActivityFeedResult } from "../../lib/activity/use-activity-feed";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { ActivityFeed } from "./ActivityFeed";
import { ActivitySkeleton } from "./ActivitySkeleton";
import { FeedEmpty, OwnActivityNote, StaleBanner } from "./ActivityStates";

export type FeedEmptyVariant = "quiet" | "filtered" | "all_clear" | "own";

interface ActivityFeedPanelProps {
  feed: ActivityFeedResult;
  nowIso: string;
  isOffline: boolean;
  isFullViewer: boolean;
  showBranch: boolean;
  canReviewRows: boolean;
  emptyVariant: FeedEmptyVariant;
  onClearFilters: () => void;
  onOpenEvent: (event: StoreActivityEvent) => void;
  onMarkReviewed: (event: StoreActivityEvent) => void;
}

/**
 * The "Activity" tab's body and every state it can be in (spec §3 shared
 * states): skeleton on a first load, an error only when there is nothing to
 * show, the stale/offline banner above rows it keeps, and the right empty.
 */
export function ActivityFeedPanel({
  feed,
  nowIso,
  isOffline,
  isFullViewer,
  showBranch,
  canReviewRows,
  emptyVariant,
  onClearFilters,
  onOpenEvent,
  onMarkReviewed,
}: ActivityFeedPanelProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [isPulling, setPulling] = useState(false);
  const toggleRollup = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const { refetch } = feed;
  const refresh = useCallback(() => {
    setPulling(true);
    void refetch().finally(() => setPulling(false));
  }, [refetch]);

  if (feed.isUnavailable && feed.events.length === 0) {
    return <EmptyState icon="info" title="Not switched on yet" message="Store activity isn't available for this store yet." />;
  }
  if (feed.isLoading) return <ActivitySkeleton />;
  if (feed.error && feed.events.length === 0) {
    return <ErrorState title="Couldn't load activity" message="Check your connection and try again." onRetry={() => void feed.refetch()} />;
  }

  const showBanner = feed.isShowingStale || (isOffline && feed.events.length > 0);
  const header = (
    <View>
      {showBanner ? <StaleBanner dataUpdatedAt={feed.dataUpdatedAt} isOffline={isOffline} onRetry={refresh} /> : null}
      {isFullViewer ? null : <OwnActivityNote />}
    </View>
  );

  return (
    <ActivityFeed
      events={feed.events}
      nowIso={nowIso}
      expandedRollups={expanded}
      showBranch={showBranch}
      canReview={canReviewRows}
      isRefreshing={isPulling}
      isFetchingMore={feed.isFetchingNextPage}
      hasMore={feed.hasNextPage}
      header={header}
      empty={<FeedEmpty variant={emptyVariant} onClearFilters={onClearFilters} />}
      onRefresh={refresh}
      onEndReached={feed.fetchNextPage}
      onOpenEvent={onOpenEvent}
      onMarkReviewed={canReviewRows ? onMarkReviewed : undefined}
      onToggleRollup={toggleRollup}
    />
  );
}
