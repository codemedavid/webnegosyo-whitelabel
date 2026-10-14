import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { ActivityDetailSheet } from "../../components/activity/ActivityDetailSheet";
import { ActivityFeedPanel } from "../../components/activity/ActivityFeedPanel";
import { platformActivityClient } from "../../lib/activity/activity-client";
import { toActivityQuery, type ActivityPeriod } from "../../lib/activity/filters";
import { canOpenMyActivity, myActivityFilters } from "../../lib/activity/my-activity";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { useActivityFeed } from "../../lib/activity/use-activity-feed";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { useAuthStore } from "../../stores/auth-store";
import { colors, spacing } from "../../theme/colors";

const PERIODS: readonly { label: string; value: ActivityPeriod }[] = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "last7" },
];
const HOUR_KEY_LENGTH = 13;

/**
 * "Your activity": the signed-in person's own refunds, cancels and stock
 * changes, today or this week. A utility screen (doors on Account and the
 * Drawer), so a cashier's tab bar never changes. Read-only: no flags to
 * review, no other people — the read always names the caller as the actor.
 */
export default function MyActivityScreen() {
  const userId = useAuthStore((s) => s.userId);
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const { status } = useConnectivity();
  const [period, setPeriod] = useState<ActivityPeriod>("today");
  const [selected, setSelected] = useState<StoreActivityEvent | null>(null);
  const isAllowed = canOpenMyActivity({ userId, tenantId, isDemo });

  const nowIso = new Date().toISOString();
  const hourIso = `${nowIso.slice(0, HOUR_KEY_LENGTH)}:00:00.000Z`;
  const query = useMemo(
    () =>
      isAllowed && userId && tenantId
        ? toActivityQuery(myActivityFilters(userId, period), { tenantId, nowIso: hourIso, isStoreWide: false, drilledOutletId: null })
        : null,
    [isAllowed, userId, tenantId, period, hourIso],
  );
  const feed = useActivityFeed(query, { client: platformActivityClient, isOnline: status !== "offline" });
  const openEvent = useCallback((event: StoreActivityEvent) => setSelected(event), []);
  const noReview = useCallback(() => undefined, []);

  return (
    <View style={styles.screen}>
      <BackHeader title="Your activity" subtitle={period === "today" ? "Today" : "Last 7 days"} />
      {isAllowed ? (
        <>
          <View style={styles.period}>
            <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} accessibilityPrefix="Show" />
          </View>
          <View style={styles.body}>
            <ActivityFeedPanel
              feed={feed}
              nowIso={nowIso}
              isOffline={status === "offline"}
              isFullViewer={false}
              showBranch={false}
              canReviewRows={false}
              emptyVariant="own"
              onClearFilters={() => setPeriod("today")}
              onOpenEvent={openEvent}
              onMarkReviewed={noReview}
            />
          </View>
          <ActivityDetailSheet
            event={selected}
            tenantId={tenantId}
            client={platformActivityClient}
            nowIso={nowIso}
            viewer={{ userId, isOwner: false, isFullViewer: false }}
            onClose={() => setSelected(null)}
            onOpen={(href) => {
              setSelected(null);
              router.push(href as never);
            }}
          />
        </>
      ) : (
        <EmptyState icon="account" title="Sign in to see your activity" message="Your activity appears here once you sign in to a store." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  period: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  body: { flex: 1 },
});
