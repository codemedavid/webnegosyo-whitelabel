import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Modal } from "../Modal";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { centeredDialog, useCenteredDialog } from "./dialog-layout";
import type { ApproverChoice } from "../../lib/gov-ledger/approval-client";
import type { ClearanceShortfall } from "../../lib/pos-stock-clearance";
import { MIN_PIN_LENGTH, PinPad } from "./gov-discount/PinPad";

export interface StockApprovalRequest {
  message: string;
  shortfalls: ClearanceShortfall[];
  approvers: ApproverChoice[];
}

type Props = {
  /** The server's "needs a manager" answer; null hides the sheet. */
  request: StockApprovalRequest | null;
  /** Ask the server again with this approver's PIN: null = approved, else the reason. */
  onSubmit: (approver: ApproverChoice, pin: string) => Promise<string | null>;
  onClose: () => void;
};

/**
 * A manager approving, with their PIN on the cashier's register, a sale that
 * sells past the stock count on a `block` store. The PIN is checked by the
 * server (same PIN and lock as Senior/PWD approvals); the database refuses the
 * sale without it. Cancel leaves the sale on the tender, nothing written.
 */
export function StockApprovalSheet({ request, onSubmit, onClose }: Props) {
  const [approver, setApprover] = useState<ApproverChoice | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const isCentered = useCenteredDialog();

  useEffect(() => {
    setApprover(null);
    setPin("");
    setPinError(null);
    setIsChecking(false);
  }, [request]);

  if (!request) return null;

  async function submit(chosen: ApproverChoice) {
    if (pin.length < MIN_PIN_LENGTH || isChecking) return;
    setIsChecking(true);
    setPinError(null);
    try {
      const refusal = await onSubmit(chosen, pin);
      if (refusal) {
        setPin("");
        setPinError(refusal);
      }
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, isCentered && centeredDialog.backdrop]}>
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Manager approval</Text>
              <Text style={styles.title} accessibilityRole="header">
                Sell past the stock count
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.text}>{request.message}</Text>
            {request.shortfalls.map((shortfall) => (
              <Text key={`${shortfall.menuItemId}:${shortfall.name}`} style={styles.listItem}>
                {shortfall.name}: {shortfall.requested} in this sale, stock covers {shortfall.producible}
              </Text>
            ))}

            {approver === null ? (
              request.approvers.length === 0 ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>No one can approve here yet</Text>
                  <Text style={styles.noticeBody}>
                    The owner, or a manager with Inventory access, can approve. Ask them to sign in on this
                    register, or sell only what is in stock.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.prompt}>Who is approving?</Text>
                  {request.approvers.map((choice) => (
                    <TouchableOpacity
                      key={choice.userId}
                      style={[styles.person, !choice.hasPin && styles.personMuted]}
                      onPress={() => choice.hasPin && setApprover(choice)}
                      disabled={!choice.hasPin}
                      accessibilityRole="button"
                      accessibilityLabel={choice.hasPin ? `Approve as ${choice.name}` : `${choice.name} has no PIN`}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{choice.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.personName}>{choice.name}</Text>
                      <Text style={styles.personMeta}>{choice.hasPin ? "›" : "No PIN set"}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )
            ) : (
              <View style={styles.pinWrap}>
                <TouchableOpacity onPress={() => setApprover(null)} accessibilityRole="button">
                  <Text style={styles.back}>‹ {approver.name}</Text>
                </TouchableOpacity>
                <Text style={styles.prompt}>Enter your approval PIN</Text>
                <PinPad value={pin} onChange={setPin} isDisabled={isChecking} />
                {pinError ? <Text style={styles.error}>{pinError}</Text> : null}
                <TouchableOpacity
                  style={[styles.primary, (pin.length < MIN_PIN_LENGTH || isChecking) && styles.primaryDisabled]}
                  onPress={() => submit(approver)}
                  disabled={pin.length < MIN_PIN_LENGTH || isChecking}
                  accessibilityRole="button"
                >
                  {isChecking ? <ActivityIndicator color={colors.card} /> : <Text style={styles.primaryText}>Approve</Text>}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "92%",
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.md },
  headerText: { gap: 2, flex: 1 },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  title: { ...typography.title, color: colors.textPrimary },
  close: { ...typography.body, fontWeight: "600", color: colors.primary },
  body: { gap: spacing.sm, paddingBottom: spacing.lg },
  text: { ...typography.body, color: colors.textPrimary },
  listItem: { ...typography.caption, color: colors.textSecondary },
  prompt: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.xs },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  personMuted: { opacity: 0.5 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  personName: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flex: 1 },
  personMeta: { ...typography.caption, color: colors.textSecondary },
  pinWrap: { alignItems: "center", gap: spacing.md },
  back: { ...typography.body, color: colors.primary, fontWeight: "600", alignSelf: "flex-start" },
  notice: { gap: spacing.sm, backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.lg },
  noticeTitle: { ...typography.heading, color: colors.textPrimary },
  noticeBody: { ...typography.caption, color: colors.textPrimary },
  primary: {
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { ...typography.body, fontWeight: "700", color: colors.card },
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
});
