import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";

import { canReviewApprovals, isApprovalsStore } from "../../lib/approvals/access";
import { homeCardCopy } from "../../lib/approvals/inbox-model";
import { ACTIVITY_REVIEW_HREF, approvalHref } from "../../lib/approvals/push-route";
import { firstName, requestHeadline, timeAgo } from "../../lib/approvals/state";
import type { ApprovalRequestView } from "../../lib/approvals/types";
import { useApprovalInbox, useNow } from "../../lib/approvals/use-approvals";
import { useAuthStore } from "../../stores/auth-store";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { SectionHeader } from "../SectionHeader";

const MAX_ROWS = 3;
const CLOCK_TICK_MS = 30_000;

interface NeedsReviewCardProps {
  requests: readonly ApprovalRequestView[];
  now: Date;
  onReview: (approvalId: string) => void;
  onSeeAll: () => void;
}

/**
 * "Needs your review" on Home (design-spec §3.11): above "Needs attention"
 * while at least one request waits. The accent is a left border, never a red
 * fill; the count lives here, not on the bell.
 */
export function NeedsReviewCard({ requests, now, onReview, onSeeAll }: NeedsReviewCardProps) {
  if (requests.length === 0) return null;
  const copy = homeCardCopy(requests, now);
  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="Needs your review"
        hint={copy.subtitle}
        actionLabel="See all"
        onAction={onSeeAll}
      />
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{copy.title}</Text>
          <View style={styles.countPill} accessibilityLabel={`${requests.length} waiting`}>
            <Text style={styles.countText}>{requests.length}</Text>
          </View>
        </View>
        {requests.slice(0, MAX_ROWS).map((request, index) => (
          <TouchableOpacity
            key={request.id}
            style={[styles.row, index > 0 && styles.rowDivided]}
            onPress={() => onReview(request.id)}
            accessibilityRole="button"
            accessibilityLabel={`Review ${requestHeadline(request)} from ${firstName(request.requestedByName)}`}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {requestHeadline(request)}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {`${firstName(request.requestedByName)} · ${timeAgo(request.createdAt, now)}`}
              </Text>
            </View>
            <Text style={styles.review}>Review</Text>
            <Icon name="chevron" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** Home's card for approvers on platform stores; nothing for anyone else. */
export function HomeNeedsReview() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const isEnabled = !isDemo && isApprovalsStore({ orderBackend }) && canReviewApprovals({ role, isOwner, permissions });
  const inbox = useApprovalInbox(tenantId, isEnabled);
  const now = useNow(CLOCK_TICK_MS);
  return (
    <NeedsReviewCard
      requests={inbox.data?.requests ?? []}
      now={now}
      onReview={(approvalId) => router.push(approvalHref({ approvalId, intent: null }) as never)}
      onSeeAll={() => router.push(ACTIVITY_REVIEW_HREF as never)}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadow.sm,
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.xs },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56 },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  review: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  countPill: {
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.statusPending.bg,
    alignItems: "center",
  },
  countText: { fontSize: 12, fontWeight: "800", color: colors.statusPending.text },
});
