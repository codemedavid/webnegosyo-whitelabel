import React, { useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";

import { decidedLine, inboxLoadProblem, recentSummary } from "../../lib/approvals/inbox-model";
import { approvalHref } from "../../lib/approvals/push-route";
import { requestHeadline } from "../../lib/approvals/state";
import { useApprovalInbox, useNow, useRecentApprovals, type ApprovalList, type ApprovalsQuery } from "../../lib/approvals/use-approvals";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ActivitySkeleton } from "../activity/ActivitySkeleton";
import { StaleBanner } from "../activity/ActivityStates";
import { OWL_IMAGE } from "../activity/owl-image";
import { ErrorState } from "../ErrorState";
import { Icon } from "../Icon";
import { SectionHeader } from "../SectionHeader";
import { ApprovalCard } from "./ApprovalCard";

const CLOCK_TICK_MS = 30_000;

interface ApprovalsInboxViewProps {
  pending: ApprovalsQuery<ApprovalList>;
  recent: ApprovalsQuery<ApprovalList>;
  now: Date;
  isOffline: boolean;
  onOpen: (approvalId: string) => void;
}

function AllSet() {
  return (
    <View style={styles.allSet}>
      <Image source={OWL_IMAGE} alt="" style={styles.owl} accessible={false} accessibilityIgnoresInvertColors />
      <Text style={styles.allSetTitle}>{"Nothing waiting. Your team's all set."}</Text>
      <Text style={styles.allSetText}>
        When someone asks for a refund, cancel, big discount or write-off, it lands here and on your phone.
      </Text>
    </View>
  );
}

function NotYetAvailable() {
  return (
    <View style={styles.allSet}>
      <Image source={OWL_IMAGE} alt="" style={styles.owl} accessible={false} accessibilityIgnoresInvertColors />
      <Text style={styles.allSetTitle}>Approvals are on their way</Text>
      <Text style={styles.allSetText}>
        Refund and cancel requests will land here once your store gets the update. Everything else in Activity works now.
      </Text>
    </View>
  );
}

function RecentSection({ requests, onOpen }: { requests: ApprovalList["requests"]; onOpen: (id: string) => void }) {
  const [isOpen, setOpen] = useState(false);
  if (requests.length === 0) return null;
  const summary = recentSummary(requests);
  return (
    <View style={styles.recent}>
      <TouchableOpacity
        style={styles.recentHeader}
        onPress={() => setOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`Recently decided: ${summary}`}
      >
        <View style={styles.recentCopy}>
          <Text style={styles.recentTitle}>Recently decided</Text>
          <Text style={styles.recentSummary}>{summary}</Text>
        </View>
        <Icon name={isOpen ? "chevron-down" : "chevron"} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {isOpen
        ? requests.map((request) => (
            <TouchableOpacity
              key={request.id}
              style={styles.recentRow}
              onPress={() => onOpen(request.id)}
              accessibilityRole="button"
              accessibilityLabel={`${requestHeadline(request)}. ${decidedLine(request)}`}
            >
              <Text style={styles.recentRowTitle} numberOfLines={1}>
                {requestHeadline(request)}
              </Text>
              <Text style={styles.recentRowMeta} numberOfLines={1}>
                {decidedLine(request)}
              </Text>
            </TouchableOpacity>
          ))
        : null}
    </View>
  );
}

/** The inbox as a pure view over its two reads (tested without a network). */
export function ApprovalsInboxView({ pending, recent, now, isOffline, onOpen }: ApprovalsInboxViewProps) {
  const [isRefreshing, setRefreshing] = useState(false);
  const requests = pending.data?.requests ?? [];

  if (pending.isLoading) return <ActivitySkeleton rows={3} />;
  if (!pending.data && pending.error) {
    const problem = inboxLoadProblem(pending.error);
    if (problem.kind === "unavailable") return <NotYetAvailable />;
    return <ErrorState title="Couldn't load requests" message={problem.message} onRetry={() => void pending.refetch()} />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void refreshWithMinSpinner([pending.refetch, recent.refetch], setRefreshing)}
          tintColor={colors.textMuted}
        />
      }
    >
      {pending.isShowingStale || isOffline ? (
        <StaleBanner dataUpdatedAt={pending.dataUpdatedAt} isOffline={isOffline} onRetry={() => void pending.refetch()} subject="requests" />
      ) : null}
      <SectionHeader
        title="To review"
        hint={requests.length === 0 ? undefined : "Oldest first: first asked, first answered"}
        trailing={
          requests.length > 0 ? (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{requests.length}</Text>
            </View>
          ) : undefined
        }
      />
      {requests.length === 0 ? (
        <AllSet />
      ) : (
        <View style={styles.cards}>
          {requests.map((request) => (
            <ApprovalCard key={request.id} request={request} now={now} onReview={onOpen} />
          ))}
        </View>
      )}
      <RecentSection requests={recent.data?.requests ?? []} onOpen={onOpen} />
    </ScrollView>
  );
}

export interface ApprovalsInboxProps {
  tenantId: string | null;
  isOffline: boolean;
  onPendingCountChange?: (count: number) => void;
}

/** "To review": the approver's waiting requests, then what was decided today. */
export function ApprovalsInbox({ tenantId, isOffline, onPendingCountChange }: ApprovalsInboxProps) {
  const pending = useApprovalInbox(tenantId, true);
  const recent = useRecentApprovals(tenantId, true);
  const now = useNow(CLOCK_TICK_MS);
  const count = pending.data?.requests.length;

  useEffect(() => {
    if (count !== undefined) onPendingCountChange?.(count);
  }, [count, onPendingCountChange]);

  return (
    <ApprovalsInboxView
      pending={pending}
      recent={recent}
      now={now}
      isOffline={isOffline}
      onOpen={(approvalId) => router.push(approvalHref({ approvalId, intent: null }) as never)}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 3, gap: spacing.md },
  cards: { gap: spacing.md },
  countPill: {
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.statusPending.bg,
    alignItems: "center",
  },
  countText: { fontSize: 12, fontWeight: "800", color: colors.statusPending.text },
  allSet: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.xs },
  owl: { width: 72, height: 72, marginBottom: spacing.sm },
  allSetTitle: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  allSetText: { ...typography.body, color: colors.textMuted, textAlign: "center", maxWidth: 300 },
  recent: { marginTop: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, overflow: "hidden" },
  recentHeader: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: spacing.lg, gap: spacing.md },
  recentCopy: { flex: 1, gap: 2 },
  recentTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  recentSummary: { ...typography.caption, color: colors.textMuted },
  recentRow: {
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    gap: 2,
  },
  recentRowTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  recentRowMeta: { ...typography.caption, color: colors.textMuted },
});
