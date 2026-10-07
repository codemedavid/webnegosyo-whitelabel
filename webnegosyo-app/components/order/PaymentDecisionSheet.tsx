/**
 * The payment question asked on the way to confirming or handing over an
 * unpaid order: "Has the customer paid?"
 *
 * Two big, plainly worded answers rather than a status to decode — the
 * wording is `lib/order-payment-prompt.ts`'s and is unit tested. Above them,
 * what the customer said about their payment at checkout (method, reference,
 * screenshot), so the merchant can check it before saying yes.
 */

import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Modal } from "../Modal";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { PaymentPromptCopy, PromptOption } from "../../lib/order-payment-prompt";
import { Icon } from "../Icon";

export interface PaymentDecisionSummary {
  amount: number;
  methodName?: string | null;
  reference?: string | null;
  proofUrl?: string | null;
}

interface PaymentDecisionSheetProps {
  visible: boolean;
  copy: PaymentPromptCopy | null;
  summary: PaymentDecisionSummary;
  /** Why "paid" cannot be chosen by this person, shown in place of acting. */
  paidDisabledReason?: string;
  isBusy: boolean;
  onPaid: () => void;
  onUnpaid: () => void;
  onClose: () => void;
}

interface ChoiceProps {
  option: PromptOption;
  tone: "paid" | "unpaid";
  disabledReason?: string;
  isBusy: boolean;
  onPress: () => void;
}

function Choice({ option, tone, disabledReason, isBusy, onPress }: ChoiceProps) {
  const isDisabled = isBusy || disabledReason !== undefined;
  const isPaid = tone === "paid";
  return (
    <TouchableOpacity
      style={[
        styles.choice,
        isPaid ? styles.choicePaid : styles.choiceUnpaid,
        isDisabled && styles.choiceDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      activeOpacity={0.85}
    >
      <View style={[styles.choiceIcon, isPaid ? styles.choiceIconPaid : styles.choiceIconUnpaid]}>
        <Icon
          name={isPaid ? "check" : "clock"}
          size={18}
          color={colors.textOnDark}
          strokeWidth={2.25}
        />
      </View>
      <View style={styles.choiceBody}>
        <Text style={styles.choiceLabel}>{option.label}</Text>
        <Text style={styles.choiceDescription}>{disabledReason ?? option.description}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function PaymentDecisionSheet({
  visible,
  copy,
  summary,
  paidDisabledReason,
  isBusy,
  onPaid,
  onUnpaid,
  onClose,
}: PaymentDecisionSheetProps) {
  if (!copy) return null;

  const reference = summary.reference?.trim();
  const proofUrl = summary.proofUrl?.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{copy.title}</Text>

          <View style={styles.summary}>
            <View style={styles.summaryMain}>
              <Text style={styles.summaryAmount}>{formatPeso(summary.amount)}</Text>
              <Text style={styles.summaryMeta}>
                {summary.methodName?.trim() ? summary.methodName : "No payment method chosen"}
                {reference ? ` · Ref ${reference}` : ""}
              </Text>
            </View>
            {proofUrl ? (
              <Image
                source={{ uri: proofUrl }}
                style={styles.proof}
                resizeMode="cover"
                alt="Payment proof the customer uploaded"
                accessibilityLabel="Payment proof the customer uploaded"
              />
            ) : null}
          </View>

          <Text style={styles.question}>{copy.question}</Text>

          <Choice
            option={copy.paid}
            tone="paid"
            disabledReason={paidDisabledReason}
            isBusy={isBusy}
            onPress={onPaid}
          />
          <Choice option={copy.unpaid} tone="unpaid" isBusy={isBusy} onPress={onUnpaid} />

          <TouchableOpacity onPress={onClose} disabled={isBusy} accessibilityRole="button">
            <Text style={styles.cancel}>{isBusy ? "Saving..." : "Cancel"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  summaryMain: { flex: 1, gap: 2 },
  summaryAmount: { fontSize: 26, fontWeight: "800", color: colors.textPrimary },
  summaryMeta: { ...typography.caption, color: colors.textSecondary },
  proof: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.card },
  question: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  choicePaid: { borderColor: colors.success, backgroundColor: colors.successLight },
  choiceUnpaid: { borderColor: colors.separator, backgroundColor: colors.card },
  choiceDisabled: { opacity: 0.55 },
  choiceIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceIconPaid: { backgroundColor: colors.success },
  choiceIconUnpaid: { backgroundColor: colors.warning },
  choiceBody: { flex: 1, gap: 2 },
  choiceLabel: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  choiceDescription: { ...typography.caption, color: colors.textSecondary },
  cancel: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
});
