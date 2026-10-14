import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { BackHeader } from "../../../components/BackHeader";
import { EmptyState } from "../../../components/EmptyState";
import { ApprovalReview } from "../../../components/approvals/ApprovalReview";
import { canOpenApprovalReview } from "../../../lib/approvals/access";
import type { ApprovalIntent } from "../../../lib/approvals/push-route";
import { usePushIntent } from "../../../lib/approvals/use-push-intent";
import { useConnectivity } from "../../../lib/offline/use-connectivity";
import { useAuthStore } from "../../../stores/auth-store";
import { colors } from "../../../theme/colors";

function readIntent(value: string | string[] | undefined): ApprovalIntent | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text === "approve" || text === "decline" ? text : null;
}

/**
 * Approval review — a utility route (href: null), opened from the inbox, the
 * Home card, the order screen or a push. The screen stays mounted between
 * requests, so the review below is keyed on the request (and on a push's
 * intent) and starts fresh each time. A push's `intent` is consumed once and
 * forgotten as soon as another request is opened (usePushIntent).
 */
export default function ApprovalReviewScreen() {
  const params = useLocalSearchParams<{ approvalId?: string; intent?: string }>();
  const approvalId = typeof params.approvalId === "string" ? params.approvalId : null;
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const { status } = useConnectivity();
  const clearIntentParam = useCallback(() => router.setParams({ intent: undefined }), []);
  const { intent, at } = usePushIntent(approvalId, readIntent(params.intent), clearIntentParam);

  if (!canOpenApprovalReview({ role, isOwner, permissions }, { orderBackend }) || !tenantId || !approvalId) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Request" />
        <EmptyState icon="info" title="Not available here" message="Approvals are for refunds and cancels on this store's orders." />
      </View>
    );
  }

  return (
    <ApprovalReview
      key={`${approvalId}:${intent ? at : "view"}`}
      tenantId={tenantId}
      approvalId={approvalId}
      viewerUserId={userId}
      isOffline={status === "offline"}
      intent={intent}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
