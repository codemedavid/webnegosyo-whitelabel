import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { approvalsApi, type ApprovalsApi } from "../../lib/approvals/api";
import type { ApprovalIntent } from "../../lib/approvals/push-route";
import {
  canChangeAmount,
  expiryLine,
  pushIntentStep,
  reviewDock,
  reviewSignals,
  reviewSubtitle,
  reviewTitle,
} from "../../lib/approvals/review-model";
import { firstName, formatPesoShort } from "../../lib/approvals/state";
import { useApprovalRequest, useInvalidateApprovals, useNow } from "../../lib/approvals/use-approvals";
import { colors, spacing, typography } from "../../theme/colors";
import { BackHeader } from "../BackHeader";
import { Button } from "../Button";
import { ErrorState } from "../ErrorState";
import { LoadingState } from "../LoadingState";
import { UndoBar } from "../UndoBar";
import { ChangeAmountSheet } from "./ChangeAmountSheet";
import { DeclineSheet, type DeclineChoice } from "./DeclineSheet";
import { ReviewDock } from "./ReviewDock";
import { RequestStatusCard } from "./RequestStatusCard";
import { ReviewAmountCard, ReviewWhoWhy, SignalList } from "./ReviewSections";

const CLOCK_TICK_MS = 15_000;
/** A result I just made closes the screen after this long (design-spec §3.7). */
const AUTO_CLOSE_MS = 2000;

interface ApprovalReviewProps {
  tenantId: string;
  approvalId: string;
  viewerUserId: string | null;
  isOffline: boolean;
  /** Set when the screen was opened by an action on a push. */
  intent: ApprovalIntent | null;
  api?: ApprovalsApi;
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.push("/(main)/dashboard");
}

/**
 * The approver's review screen (design-spec §3.7): amount → who and why →
 * worth knowing → the slide. Re-checks the request on open (someone else may
 * have answered), and an Approve tapped on a push waits 4 seconds with Undo
 * before anything is sent.
 */
export function ApprovalReview({ tenantId, approvalId, viewerUserId, isOffline, intent, api = approvalsApi }: ApprovalReviewProps) {
  const query = useApprovalRequest(tenantId, approvalId, api);
  const invalidate = useInvalidateApprovals(tenantId);
  const now = useNow(CLOCK_TICK_MS);
  const [mountedAt] = useState(() => Date.now());
  const [override, setOverride] = useState<number | null>(null);
  const [isDeclineOpen, setDeclineOpen] = useState(false);
  const [isChangeOpen, setChangeOpen] = useState(false);
  const [isDeciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushStep, setPushStep] = useState<"idle" | "countdown" | "done">(intent ? "idle" : "done");
  const [didDecide, setDidDecide] = useState(false);
  const [isWithdrawing, setWithdrawing] = useState(false);
  const autoClose = useRef<ReturnType<typeof setTimeout> | null>(null);

  const request = query.data;
  const isFresh = query.dataUpdatedAt >= mountedAt;

  // Every open re-reads (someone else may have answered); a push's action
  // waits for that read before doing anything.
  const { refetch } = query;
  useEffect(() => {
    void refetch();
  }, [refetch]);

  // The push's intent runs once, after a fresh read says it still applies.
  useEffect(() => {
    if (pushStep !== "idle" || !intent) return;
    const step = pushIntentStep(request, { isFresh, isOffline });
    if (step === "wait") return;
    if (step === "drop") setPushStep("done");
    else if (intent === "approve") setPushStep("countdown");
    else {
      setDeclineOpen(true);
      setPushStep("done");
    }
  }, [pushStep, intent, request, isFresh, isOffline]);

  // My own executed approval closes itself; any tap closes it sooner.
  useEffect(() => {
    if (!didDecide || request?.status !== "executed") return;
    autoClose.current = setTimeout(leave, AUTO_CLOSE_MS);
    return () => {
      if (autoClose.current) clearTimeout(autoClose.current);
    };
  }, [didDecide, request?.status]);

  if (query.isLoading) return <LoadingState fullScreen message="Loading request..." />;
  if (!request) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Request" />
        <ErrorState
          title="Couldn't open this request"
          message={query.error?.message ?? "Check your connection and try again."}
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  }

  const approveAmount = override ?? request.amount;
  const requester = firstName(request.requestedByName);

  const decide = async (decision: "approve" | "decline", choice?: DeclineChoice, source: "app" | "push" = "app") => {
    setDeciding(true);
    setError(null);
    const result = await api.decide(tenantId, approvalId, {
      decision,
      ...(choice ? { reasonCode: choice.reasonCode, ...(choice.note ? { note: choice.note } : {}) } : {}),
      ...(decision === "approve" && override !== null && override < request.amount ? { amountOverride: override } : {}),
      source,
    });
    setDeciding(false);
    if (result.ok) {
      setDidDecide(true);
      setDeclineOpen(false);
    } else {
      setError(result.error);
    }
    await invalidate();
  };

  const expiry = expiryLine(request, now);
  const dock = reviewDock(request, { isOffline, viewerUserId, now });
  // The person who asked (a result push lands here) reads their own card.
  const isRequesterView = request.requestedBy === viewerUserId && !request.canDecide;
  const withdraw = async () => {
    setWithdrawing(true);
    const result = await api.withdraw(tenantId, approvalId);
    setWithdrawing(false);
    if (!result.ok) setError(result.error);
    await invalidate();
  };

  return (
    <View style={styles.screen}>
      <BackHeader title={reviewTitle(request.kind)} subtitle={reviewSubtitle(request, now)} />
      <ScrollView contentContainerStyle={styles.content}>
        <ReviewAmountCard request={request} approveAmount={approveAmount} />
        <ReviewWhoWhy request={request} now={now} />
        <SignalList signals={reviewSignals(request, now)} />
        {expiry ? <Text style={styles.expiry}>{expiry}</Text> : null}
        {request.externalOrderId ? (
          <Button
            label={request.orderNumber ? `Open order ${request.orderNumber}` : "Open order"}
            tone="ghost"
            onPress={() => router.push(`/(main)/order/${request.externalOrderId}` as never)}
          />
        ) : null}
      </ScrollView>
      {isRequesterView ? (
        <View style={styles.undoWrap}>
          <RequestStatusCard
            request={request}
            approverNames={[]}
            now={now}
            isWithdrawing={isWithdrawing}
            onWithdraw={() => void withdraw()}
            onAskAgain={() =>
              request.externalOrderId ? router.push(`/(main)/order/${request.externalOrderId}` as never) : leave()
            }
            onDismiss={leave}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : pushStep === "countdown" ? (
        <View style={styles.undoWrap}>
          <UndoBar
            message={`Approving ${formatPesoShort(approveAmount)} for ${requester}…`}
            onUndo={() => setPushStep("done")}
            onCommit={() => {
              setPushStep("done");
              void decide("approve", undefined, "push");
            }}
          />
        </View>
      ) : (
        <ReviewDock
          request={request}
          dock={dock}
          approveAmount={approveAmount}
          isDeciding={isDeciding}
          error={error}
          onApprove={() => void decide("approve")}
          onDecline={() => setDeclineOpen(true)}
          onChangeAmount={canChangeAmount(request) ? () => setChangeOpen(true) : undefined}
          onDone={leave}
        />
      )}
      <DeclineSheet
        visible={isDeclineOpen}
        requesterFirstName={requester}
        isBusy={isDeciding}
        error={isDeclineOpen ? error : null}
        onConfirm={(choice) => void decide("decline", choice)}
        onClose={() => setDeclineOpen(false)}
      />
      <ChangeAmountSheet
        visible={isChangeOpen}
        max={request.amount}
        requesterFirstName={requester}
        onApply={(amount) => {
          setOverride(amount);
          setChangeOpen(false);
        }}
        onClose={() => setChangeOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  expiry: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  undoWrap: { padding: spacing.lg, gap: spacing.sm },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600", textAlign: "center" },
});
