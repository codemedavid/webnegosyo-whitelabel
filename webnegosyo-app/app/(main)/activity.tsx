import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { SegmentedControl } from "../../components/SegmentedControl";
import { ActivityDetailSheet } from "../../components/activity/ActivityDetailSheet";
import { ActivityFeedPanel, type FeedEmptyVariant } from "../../components/activity/ActivityFeedPanel";
import { ActivityFilterBar } from "../../components/activity/ActivityFilterBar";
import { ActivityFilterSheet } from "../../components/activity/ActivityFilterSheet";
import { ApprovalsInboxSlot } from "../../components/activity/ApprovalsInboxSlot";
import { SummaryView } from "../../components/activity/SummaryView";
import { platformActivityClient } from "../../lib/activity/activity-client";
import { filtersFromParams, paramsKey } from "../../lib/activity/activity-links";
import { canReviewEvent } from "../../lib/activity/detail-facts";
import {
  activityFiltersReducer,
  DEFAULT_ACTIVITY_FILTERS,
  PERIOD_LABELS,
  toActivityQuery,
  type ActivityFilters,
  type ActivitySubjectFilter,
} from "../../lib/activity/filters";
import { activityAccess } from "../../lib/activity/row-a11y";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { useActivityFeed } from "../../lib/activity/use-activity-feed";
import { useMarkReviewed } from "../../lib/activity/use-mark-reviewed";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { useAccountBranchScope, useBranchScope } from "../../lib/use-branch-scope";
import { useOutlets } from "../../lib/use-outlets";
import { useAuthStore } from "../../stores/auth-store";
import { colors, radius, spacing, typography } from "../../theme/colors";

type Segment = "review" | "activity" | "summary";

const SEARCH_DEBOUNCE_MS = 300;
const MINUTE_MS = 60_000;

/** Now, floored to the minute, so query keys built from it stay stable while you read. */
function minuteIso(): string {
  return new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS).toISOString();
}

function isDefaultFeed(filters: ActivityFilters): boolean {
  return JSON.stringify({ ...filters, flaggedOnly: false }) === JSON.stringify(DEFAULT_ACTIVITY_FILTERS);
}

/**
 * Store activity: what happened in the store, who did it, and what needs a
 * look (design spec §3.1–3.4). Every staff member can open it — the server
 * returns only their own rows (flags stripped) unless they hold
 * activity_view / approve_requests or own the store. "To review" is the
 * approvals inbox slot (Phase 3); "Summary" is for the store view only.
 */
export default function ActivityScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const accountOutletName = useAuthStore((s) => s.outletName);
  const access = useMemo(() => activityAccess({ role, isOwner, permissions }), [role, isOwner, permissions]);
  const accountScope = useAccountBranchScope();
  const scope = useBranchScope();
  const { outlets } = useOutlets();
  const { status } = useConnectivity();
  const isOffline = status === "offline";

  const [segment, setSegment] = useState<Segment>("activity");
  const [filters, dispatch] = useReducer(activityFiltersReducer, DEFAULT_ACTIVITY_FILTERS);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [isSearching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<StoreActivityEvent | null>(null);
  const nowIso = minuteIso();

  // A link (staff profile, ingredient) arrives once per distinct set of params.
  const linkKey = paramsKey(params);
  useEffect(() => {
    const linked = filtersFromParams(params);
    if (!linked) return;
    dispatch({ type: "replace", filters: linked });
    setSegment("activity");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the link's identity
  }, [linkKey]);

  useEffect(() => {
    const timer = setTimeout(() => dispatch({ type: "setSearch", text: searchText }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const isStoreWide = accountScope.kind === "all";
  const drilledOutletId = scope.kind === "branch" ? scope.outletId : null;
  // Periods start at Manila midnight; the hour is precise enough and keeps the
  // feed's cache key from changing every minute.
  const hourIso = `${nowIso.slice(0, 13)}:00:00.000Z`;
  const query = useMemo(
    () => (tenantId ? toActivityQuery(filters, { tenantId, nowIso: hourIso, isStoreWide, drilledOutletId }) : null),
    [tenantId, filters, hourIso, isStoreWide, drilledOutletId],
  );
  const feed = useActivityFeed(query, { client: platformActivityClient, isOnline: !isOffline });
  const review = useMarkReviewed(platformActivityClient, tenantId);

  const outletName = useCallback((id: string) => outlets.find((outlet) => outlet.id === id)?.name ?? null, [outlets]);
  const viewer = { userId, isOwner: access.isOwner, isFullViewer: access.isFullViewer };
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const event of feed.events) if (event.actorUserId && event.actorName) seen.set(event.actorUserId, event.actorName);
    if (filters.actor) seen.set(filters.actor.id, filters.actor.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [feed.events, filters.actor]);
  const flaggedLoaded = feed.events.filter((event) => event.flags.length > 0 && event.reviewedAt === null).length;

  const scopeName = !isStoreWide
    ? accountOutletName ?? "Your branch"
    : (filters.outletId ?? drilledOutletId) ? outletName(filters.outletId ?? drilledOutletId ?? "") ?? "One branch" : outlets.length > 1 ? "All branches" : null;
  const subtitle = [PERIOD_LABELS[filters.period], scopeName].filter(Boolean).join(" · ");

  const segments = [
    ...(access.isApprover ? [{ label: "To review", value: "review" as Segment }] : []),
    { label: "Activity", value: "activity" as Segment },
    ...(access.isFullViewer ? [{ label: "Summary", value: "summary" as Segment }] : []),
  ];

  const emptyVariant: FeedEmptyVariant = filters.flaggedOnly
    ? "all_clear"
    : !isDefaultFeed(filters)
      ? "filtered"
      : access.isFullViewer
        ? "quiet"
        : "own";

  const openEvent = useCallback((event: StoreActivityEvent) => setSelected(event), []);
  const markFromRow = useCallback(
    (event: StoreActivityEvent) => {
      if (canReviewEvent(event, viewer)) void review.mark(event.id);
      else setSelected(event);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewer is derived from the deps below
    [review.mark, userId, access.isOwner, access.isFullViewer],
  );
  const showSubject = (subject: ActivitySubjectFilter) => {
    setSelected(null);
    dispatch({ type: "replace", filters: { ...DEFAULT_ACTIVITY_FILTERS, period: "month", subject } });
    setSegment("activity");
  };
  // The sheet follows the live row, so "Mark reviewed" shows its result.
  const liveSelected = selected ? feed.events.find((event) => event.id === selected.id) ?? selected : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={access.isFullViewer ? "Activity" : "Your activity"}
        subtitle={subtitle || undefined}
        actions={
          segment === "activity" ? (
            <IconButton icon="search" label={isSearching ? "Close search" : "Search activity"} onPress={() => setSearching((open) => !open)} />
          ) : undefined
        }
      >
        {segments.length > 1 ? (
          <SegmentedControl options={segments} value={segment} onChange={setSegment} accessibilityPrefix="Show" />
        ) : null}
        {segment === "activity" && isSearching ? (
          <TextInput
            style={styles.search}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Order number, item or reason"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search activity"
            autoFocus
            returnKeyType="search"
          />
        ) : null}
      </ScreenHeader>

      {segment === "activity" ? (
        <ActivityFilterBar
          filters={filters}
          viewer={{ isOwner: access.isOwner, isFullViewer: access.isFullViewer, flaggedOpen: flaggedLoaded }}
          outletName={outletName}
          onQuick={(value) => dispatch({ type: "quick", value })}
          onOpenSheet={() => setSheetOpen(true)}
          onRemoveChip={(key) => {
            if (key === "search") setSearchText("");
            dispatch({ type: "removeChip", key });
          }}
          onClearAll={() => {
            setSearchText("");
            dispatch({ type: "reset" });
          }}
        />
      ) : null}

      <View style={styles.body}>
        {segment === "review" ? <ApprovalsInboxSlot tenantId={tenantId} /> : null}
        {segment === "activity" ? (
          <ActivityFeedPanel
            feed={feed}
            nowIso={nowIso}
            isOffline={isOffline}
            isFullViewer={access.isFullViewer}
            showBranch={isStoreWide && outlets.length > 1 && !filters.outletId && !drilledOutletId}
            canReviewRows={access.isFullViewer}
            emptyVariant={emptyVariant}
            onClearFilters={() => {
              setSearchText("");
              dispatch({ type: "reset" });
            }}
            onOpenEvent={openEvent}
            onMarkReviewed={markFromRow}
          />
        ) : null}
        {segment === "summary" ? (
          <SummaryView
            tenantId={tenantId}
            client={platformActivityClient}
            outletId={isStoreWide ? drilledOutletId : null}
            isFullViewer={access.isFullViewer}
            nowIso={nowIso}
            onOpenCategory={(category) => {
              dispatch({ type: "quick", value: category });
              setSegment("activity");
            }}
            onOpenFlags={() => {
              dispatch({ type: "quick", value: "needs_look" });
              setSegment("activity");
            }}
            onOpenEvent={openEvent}
            onOpenPerson={(person) => {
              dispatch({ type: "setActor", actor: { id: person.actorUserId, name: person.name } });
              setSegment("activity");
            }}
          />
        ) : null}
      </View>

      <ActivityFilterSheet
        visible={isSheetOpen}
        filters={filters}
        isFullViewer={access.isFullViewer}
        isOwner={access.isOwner}
        people={people}
        outlets={isStoreWide ? outlets : []}
        lockedBranchName={isStoreWide ? null : accountOutletName ?? "Your branch"}
        nowMs={Date.parse(nowIso)}
        onApply={(next) => {
          dispatch({ type: "replace", filters: next });
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />

      <ActivityDetailSheet
        event={liveSelected}
        tenantId={tenantId}
        client={platformActivityClient}
        nowIso={nowIso}
        viewer={viewer}
        onClose={() => setSelected(null)}
        onOpen={(href) => {
          setSelected(null);
          router.push(href as never);
        }}
        onSeeHistory={showSubject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  search: {
    ...typography.body,
    minHeight: 48,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    color: colors.textPrimary,
  },
});
