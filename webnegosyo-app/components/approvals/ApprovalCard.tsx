import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { firstName, formatPesoShort, inboxCardLines, kindTitle } from "../../lib/approvals/state";
import type { ApprovalRequestView } from "../../lib/approvals/types";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { StaffAvatar } from "../staff/StaffAvatar";

interface ApprovalCardProps {
  request: ApprovalRequestView;
  now: Date;
  onReview: (approvalId: string) => void;
}

/**
 * One waiting request in "To review" (design-spec §3.6): who, what, how much,
 * why, how long ago — and one full-width Review. No inline Approve: deciding
 * without the context on the review screen defeats it. A request above the
 * viewer's limit is greyed and says the owner has it.
 */
function ApprovalCardBase({ request, now, onReview }: ApprovalCardProps) {
  const lines = inboxCardLines(request, now);
  const requester = request.requestedByName ?? "Staff";
  const reviewLabel = `Review ${kindTitle(request.kind).toLowerCase()} ${formatPesoShort(request.amount)} from ${firstName(request.requestedByName)}`;

  return (
    <View style={[styles.card, lines.overLimitNote ? styles.cardMuted : null]}>
      <View style={styles.top}>
        <StaffAvatar name={requester} seed={request.requestedBy} size="sm" />
        <View style={styles.copy}>
          <Text style={styles.headline} numberOfLines={1}>
            {lines.headline}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {lines.detail}
          </Text>
        </View>
        {lines.timeLeftChip ? (
          <View style={styles.chip}>
            <Icon name="clock" size={13} color={colors.statusPending.text} />
            <Text style={styles.chipText}>{lines.timeLeftChip}</Text>
          </View>
        ) : null}
      </View>
      {request.note ? (
        <Text style={styles.quote} numberOfLines={2}>
          {`“${request.note}”`}
        </Text>
      ) : null}
      {lines.overLimitNote ? (
        <View style={styles.overLimit}>
          <Icon name="info" size={15} color={colors.textMuted} />
          <Text style={styles.overLimitText}>{lines.overLimitNote}</Text>
        </View>
      ) : null}
      <Button
        label="Review"
        tone={lines.overLimitNote ? "secondary" : "primary"}
        size="lg"
        onPress={() => onReview(request.id)}
        accessibilityLabel={reviewLabel}
      />
    </View>
  );
}

export const ApprovalCard = memo(ApprovalCardBase);

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    ...shadow.sm,
  },
  cardMuted: { borderLeftColor: colors.separator, backgroundColor: colors.surfaceSubtle },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  headline: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textMuted },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.statusPending.bg,
  },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.statusPending.text },
  quote: {
    ...typography.body,
    fontStyle: "italic",
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  overLimit: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  overLimitText: { ...typography.caption, color: colors.textMuted, flex: 1 },
});
