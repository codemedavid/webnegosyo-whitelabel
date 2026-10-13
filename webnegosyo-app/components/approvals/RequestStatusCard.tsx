import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { requesterCard, type RequesterCardAction, type RequesterCardTone } from "../../lib/approvals/state";
import type { ApprovalRequestView } from "../../lib/approvals/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";

interface RequestStatusCardProps {
  request: ApprovalRequestView | null;
  /** First names from the create response, owner last. */
  approverNames: readonly string[];
  now: Date;
  isSending?: boolean;
  isWithdrawing: boolean;
  expiryMinutes?: number;
  onWithdraw: (approvalId: string) => void;
  onAskAgain: (request: ApprovalRequestView) => void;
  onDismiss: (approvalId: string) => void;
}

/** Every state carries a word and a shape, never colour alone (spec P7); never a red card. */
const LOOK: Readonly<Record<RequesterCardTone, { bg: string; fg: string; icon: IconName }>> = {
  neutral: { bg: colors.surfaceSubtle, fg: colors.textPrimary, icon: "send" },
  waiting: { bg: colors.statusPending.bg, fg: colors.statusPending.text, icon: "clock" },
  success: { bg: colors.successLight, fg: colors.statusReady.text, icon: "check" },
  declined: { bg: colors.surfaceSubtle, fg: colors.textPrimary, icon: "message" },
  closed: { bg: colors.surfaceSubtle, fg: colors.textPrimary, icon: "info" },
};

const ACTION_LABEL: Readonly<Record<Exclude<RequesterCardAction, "withdraw">, string>> = {
  print_again: "Print slip again",
  done: "Done",
  ok: "OK",
  ask_again: "Ask again",
  ask_again_with_changes: "Ask again with changes",
};

/**
 * The requester's live card on the order screen (design-spec §3.9): all seven
 * states from lib/approvals/state.ts. Withdraw is two-step; the decline shows
 * the approver's reason and words, softened, never hidden.
 */
export function RequestStatusCard(props: RequestStatusCardProps) {
  const { request, approverNames, now, isSending, isWithdrawing, expiryMinutes, onWithdraw, onAskAgain, onDismiss } = props;
  const [isConfirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const card = requesterCard(request, { now, approverNames, isSending, expiryMinutes, canPrintSlip: false });
  const look = LOOK[card.tone];

  const press = (action: RequesterCardAction) => {
    if (!request) return;
    if (action === "withdraw") setConfirmingWithdraw(true);
    else if (action === "ask_again" || action === "ask_again_with_changes") onAskAgain(request);
    else onDismiss(request.id);
  };

  return (
    <View style={[styles.card, { backgroundColor: look.bg }]} accessibilityLiveRegion="polite">
      <View style={styles.head}>
        {card.showSpinner ? <ActivityIndicator color={look.fg} /> : <Icon name={look.icon} size={20} color={look.fg} />}
        <View style={styles.copy}>
          <Text style={[styles.title, { color: look.fg }]}>{card.title}</Text>
          {card.subtitle ? <Text style={styles.subtitle}>{card.subtitle}</Text> : null}
        </View>
      </View>
      {card.reasonChip ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{card.reasonChip}</Text>
        </View>
      ) : null}
      {card.quote ? <Text style={styles.quote}>{`“${card.quote}”`}</Text> : null}
      {isConfirmingWithdraw && request ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Withdraw request?</Text>
          <View style={styles.actions}>
            <Button label="Keep waiting" tone="secondary" onPress={() => setConfirmingWithdraw(false)} />
            <Button
              label="Withdraw"
              accessibilityLabel="Withdraw request"
              tone="primary"
              isLoading={isWithdrawing}
              onPress={() => {
                setConfirmingWithdraw(false);
                onWithdraw(request.id);
              }}
            />
          </View>
        </View>
      ) : card.actions.length > 0 ? (
        <View style={styles.actions}>
          {card.actions.map((action) =>
            action === "withdraw" ? (
              <Button key={action} label="Withdraw" tone="ghost" onPress={() => press(action)} isLoading={isWithdrawing} />
            ) : (
              <Button
                key={action}
                label={ACTION_LABEL[action]}
                tone={action === "done" || action === "ok" ? "secondary" : "primary"}
                onPress={() => press(action)}
              />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700" },
  subtitle: { ...typography.caption, color: colors.textMuted },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  quote: { ...typography.body, fontStyle: "italic", color: colors.textPrimary },
  confirm: { gap: spacing.sm },
  confirmText: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "flex-end" },
});
