import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { approveA11yLabel, approveSlideLabel, type ReviewDock as DockState } from "../../lib/approvals/review-model";
import { formatPesoShort } from "../../lib/approvals/state";
import type { ApprovalRequestView } from "../../lib/approvals/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { SlideAction } from "../SlideAction";

interface ReviewDockProps {
  request: ApprovalRequestView;
  dock: DockState;
  /** The amount being approved: the request's, or a lower one the approver chose. */
  approveAmount: number;
  isDeciding: boolean;
  error: string | null;
  onApprove: () => void;
  onDecline: () => void;
  /** Present only when the request can be approved for less (amount refunds). */
  onChangeAmount?: () => void;
  onDone: () => void;
}

const DONE_LOOK: Readonly<Record<"success" | "neutral" | "danger", { bg: string; fg: string; icon: IconName }>> = {
  success: { bg: colors.successLight, fg: colors.statusReady.text, icon: "check" },
  neutral: { bg: colors.surfaceSubtle, fg: colors.textPrimary, icon: "info" },
  danger: { bg: colors.dangerLight, fg: colors.statusCancelled.text, icon: "warning" },
};

function Notice({ icon, fg, bg, title, text, detail }: { icon: IconName; fg: string; bg: string; title?: string; text: string; detail?: string | null }) {
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <Icon name={icon} size={20} color={fg} />
      <View style={styles.noticeCopy}>
        {title ? <Text style={[styles.noticeTitle, { color: fg }]}>{title}</Text> : null}
        <Text style={[styles.noticeText, { color: fg }]}>{text}</Text>
        {detail ? <Text style={styles.noticeDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The review screen's bottom dock (design-spec §3.7.6): the slide named by
 * the amount, then "Decline…" and "Change amount" as text buttons at least
 * 24pt apart — never Approve and Decline side by side. Every other state
 * replaces the dock with one sentence.
 */
export function ReviewDock(props: ReviewDockProps) {
  const { request, dock, approveAmount, isDeciding, error, onApprove, onDecline, onChangeAmount, onDone } = props;
  const priced = { ...request, amount: approveAmount };

  const body = (() => {
    switch (dock.kind) {
      case "decide":
        return (
          <>
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <SlideAction
              label={approveSlideLabel(priced)}
              fallbackLabel={`Approve ${formatPesoShort(approveAmount)}`}
              accessibilityLabel={approveA11yLabel(priced)}
              onComplete={onApprove}
              isBusy={isDeciding}
            />
            <View style={styles.textActions}>
              <TouchableOpacity onPress={onDecline} disabled={isDeciding} style={styles.textButton} accessibilityRole="button" accessibilityLabel="Decline…">
                <Text style={styles.declineText}>Decline…</Text>
              </TouchableOpacity>
              {onChangeAmount ? (
                <TouchableOpacity
                  onPress={onChangeAmount}
                  disabled={isDeciding}
                  style={styles.textButton}
                  accessibilityRole="button"
                  accessibilityLabel="Change amount"
                >
                  <Text style={styles.changeText}>Change amount</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        );
      case "offline":
        return <Notice icon="info" fg={colors.textPrimary} bg={colors.infoLight} text={dock.text} />;
      case "waiting":
        return <Notice icon="clock" fg={colors.statusPending.text} bg={colors.statusPending.bg} title={dock.title} text={dock.text} />;
      case "busy":
        return (
          <View style={[styles.notice, { backgroundColor: colors.statusPending.bg }]}>
            <ActivityIndicator color={colors.statusPending.text} />
            <Text style={[styles.noticeText, { color: colors.statusPending.text }]}>{dock.text}</Text>
          </View>
        );
      case "done": {
        const look = DONE_LOOK[dock.tone];
        return (
          <>
            <Notice icon={look.icon} fg={look.fg} bg={look.bg} text={dock.text} detail={dock.detail} />
            <Button label="Done" tone="secondary" size="lg" onPress={onDone} />
          </>
        );
      }
    }
  })();

  // The tab bar sits below this screen, so the home-indicator inset is its job.
  return <View style={styles.dock}>{body}</View>;
}

const styles = StyleSheet.create({
  dock: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  textActions: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xxl },
  textButton: { minHeight: 48, minWidth: 96, justifyContent: "center", paddingHorizontal: spacing.sm },
  declineText: { ...typography.body, fontWeight: "700", color: colors.danger },
  changeText: { ...typography.body, fontWeight: "700", color: colors.textPrimary, textAlign: "right" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { ...typography.body, fontWeight: "700" },
  noticeText: { ...typography.body, fontWeight: "600" },
  noticeDetail: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600", textAlign: "center" },
});
