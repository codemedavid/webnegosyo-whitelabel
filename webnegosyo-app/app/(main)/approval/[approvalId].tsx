import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { BackHeader } from "../../../components/BackHeader";
import { EmptyState } from "../../../components/EmptyState";
import { ApprovalReview } from "../../../components/approvals/ApprovalReview";
import { canOpenApprovalReview } from "../../../lib/approvals/access";
import type { ApprovalIntent } from "../../../lib/approvals/push-route";
import { useConnectivity } from "../../../lib/offline/use-connectivity";
import { useAuthStore } from "../../../stores/auth-store";
import { colors } from "../../../theme/colors";

interface PendingIntent {
  approvalId: string;
  intent: ApprovalIntent;
  /** Distinguishes two pushes for the same request. */
  at: number;
}

function readIntent(value: string | string[] | undefined): ApprovalIntent | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text === "approve" || text === "decline" ? text : null;
}

/**
 * Approval review — a utility route (href: null), opened from the inbox, the
 * Home card, the order screen or a push. The screen stays mounted between
 * requests, so the review below is keyed on the request (and on a push's
 * intent) and starts fresh each time. A push's `intent` is consumed once.
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
  const [pending, setPending] = useState<PendingIntent | null>(null);

  const intentParam = readIntent(params.intent);
  useEffect(() => {
    if (!intentParam || !approvalId) return;
    setPending({ approvalId, intent: intentParam, at: Date.now() });
    router.setParams({ intent: undefined });
  }, [intentParam, approvalId]);

  if (!canOpenApprovalReview({ role, isOwner, permissions }, { orderBackend }) || !tenantId || !approvalId) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Request" />
        <EmptyState icon="info" title="Not available here" message="Approvals are for refunds and cancels on this store's orders." />
      </View>
    );
  }

  const intent = pending?.approvalId === approvalId ? pending.intent : null;
  return (
    <ApprovalReview
      key={`${approvalId}:${intent ? pending?.at : "view"}`}
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
