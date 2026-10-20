import React, { useState } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { router } from "expo-router";

import { canAskForApproval, canReviewApprovals, isApprovalsStore } from "../../lib/approvals/access";
import { approvalsApi } from "../../lib/approvals/api";
import { orderEntries, orderRequestToShow, toRequestOrder, type OrderForRequest } from "../../lib/approvals/order-requests";
import { approvalHref } from "../../lib/approvals/push-route";
import type { RequestSheetKind } from "../../lib/approvals/request-draft";
import { firstName, requestHeadline, shouldKeepPolling } from "../../lib/approvals/state";
import type { ApprovalRequestView, CreateApprovalResult } from "../../lib/approvals/types";
import { useApprovalInbox, useInvalidateApprovals, useMyApprovalRequests, useNow } from "../../lib/approvals/use-approvals";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { hasPermission } from "../../lib/staff-permissions";
import { useAuthStore } from "../../stores/auth-store";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { ListRow } from "../ListRow";
import { RequestSheet } from "./RequestSheet";
import { RequestStatusCard } from "./RequestStatusCard";

const CLOCK_TICK_MS = 15_000;

interface OrderApprovalsPanelProps {
  order: OrderForRequest & { status: string };
  isUnpaid: boolean;
  style?: ViewStyle;
}

/**
 * Refunds and paid cancels on the order screen (Phase 3): the requester's
 * live status card, "Refund" / "Ask to cancel" for a paid order, and — for an
 * approver — a door to someone else's waiting request on this order.
 * Platform stores only: other store types never see the entries.
 */
export function OrderApprovalsPanel({ order, isUnpaid, style }: OrderApprovalsPanelProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const { status: connectivity } = useConnectivity();
  const user = { role, isOwner, permissions };
  const isStore = isApprovalsStore({ orderBackend }) && !isDemo;
  const canAsk = isStore && canAskForApproval(user);
  const isApprover = isStore && canReviewApprovals(user);

  const mine = useMyApprovalRequests(tenantId, canAsk);
  const inbox = useApprovalInbox(tenantId, isApprover);
  const invalidate = useInvalidateApprovals(tenantId);
  const now = useNow(CLOCK_TICK_MS);
  const [sheetKind, setSheetKind] = useState<RequestSheetKind | null>(null);
  const [sent, setSent] = useState<CreateApprovalResult | null>(null);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const [isWithdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  if (!isStore || !tenantId) return null;

  // The create response shows at once; the list catches up on its next read.
  const listed = mine.data?.requests ?? [];
  const known = sent && !listed.some((request) => request.id === sent.request.id) ? [sent.request, ...listed] : listed;
  const shown = orderRequestToShow(known, order.id, now, dismissed);
  const approverNames = sent && shown && sent.request.id === shown.id ? sent.approvers : [];
  const othersWaiting = (inbox.data?.requests ?? []).filter(
    (request) => request.externalOrderId === order.id && request.requestedBy !== userId,
  );
  const entries = orderEntries({
    isApprovalsStore: isStore,
    canAsk,
    holdsOrders: hasPermission(user, "orders"),
    isUnpaid,
    refundable: order.refundable,
    status: order.status,
    hasActiveRequest: shown !== null && shouldKeepPolling(shown),
  });

  const withdraw = async (approvalId: string) => {
    setWithdrawing(true);
    setWithdrawError(null);
    const result = await approvalsApi.withdraw(tenantId, approvalId);
    setWithdrawing(false);
    if (!result.ok) setWithdrawError(result.error);
    await invalidate();
  };

  const askAgain = (request: ApprovalRequestView) => {
    setDismissed((ids) => [...ids, request.id]);
    setSheetKind(request.kind === "cancel_paid" ? "cancel_paid" : "refund");
  };

  if (!shown && othersWaiting.length === 0 && !entries.canRefund && !entries.canAskToCancel) return null;

  return (
    <View style={[styles.wrap, style]}>
      {shown ? (
        <RequestStatusCard
          request={shown}
          approverNames={approverNames}
          now={now}
          isWithdrawing={isWithdrawing}
          onWithdraw={(id) => void withdraw(id)}
          onAskAgain={askAgain}
          onDismiss={(id) => setDismissed((ids) => [...ids, id])}
        />
      ) : null}
      {withdrawError ? <Text style={styles.error}>{withdrawError}</Text> : null}
      {othersWaiting.map((request) => (
        <ListRow
          key={request.id}
          icon="bell"
          tone="accent"
          title={`${requestHeadline(request)} requested`}
          subtitle={`${firstName(request.requestedByName)} is waiting for an answer`}
          onPress={() => router.push(approvalHref({ approvalId: request.id, intent: null }) as never)}
        />
      ))}
      {entries.canRefund || entries.canAskToCancel ? (
        <View style={styles.entries}>
          {entries.canRefund ? <Button label="Refund" icon="rotate" tone="secondary" onPress={() => setSheetKind("refund")} /> : null}
          {entries.canAskToCancel ? <Button label="Ask to cancel" tone="secondary" onPress={() => setSheetKind("cancel_paid")} /> : null}
        </View>
      ) : null}
      {sheetKind ? (
        <RequestSheet
          visible
          kind={sheetKind}
          order={toRequestOrder(order)}
          tenantId={tenantId}
          user={user}
          userId={userId}
          isOffline={connectivity === "offline"}
          onClose={() => setSheetKind(null)}
          onSent={(result) => {
            setSent(result);
            setSheetKind(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  entries: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600", paddingHorizontal: spacing.xs, borderRadius: radius.sm },
});
