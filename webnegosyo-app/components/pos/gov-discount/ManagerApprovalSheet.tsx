import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Modal } from "../../Modal";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { centeredDialog, useCenteredDialog } from "../dialog-layout";
import { formatPeso } from "../../../lib/format";
import {
  fetchApprovers,
  requestApproval,
  type ApprovalAsk,
  type ApproverChoice,
} from "../../../lib/gov-ledger/approval-client";
import type { PosGovApproval } from "../../../lib/pos-gov-discount";
import { MIN_PIN_LENGTH, PinPad } from "./PinPad";

type Props = {
  visible: boolean;
  tenantId: string;
  outletId: string | null;
  reduction: number;
  claimants: ApprovalAsk["claimants"];
  onApproved: (approval: PosGovApproval) => void;
  /** Offline: let the sale through, flagged for the owner. */
  onSkipOffline: () => void;
  onClose: () => void;
};

type Phase =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "error"; message: string }
  | { kind: "pick"; approvers: ApproverChoice[] }
  | { kind: "pin"; approvers: ApproverChoice[]; approver: ApproverChoice };

/**
 * A manager vouching for a large Senior/PWD discount on the cashier's own
 * device. The discount itself is never refused — when the server cannot be
 * reached the sale goes through and the owner sees it flagged.
 */
export function ManagerApprovalSheet(props: Props) {
  const { visible, tenantId, outletId, reduction, claimants, onApproved, onSkipOffline, onClose } = props;
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const isCentered = useCenteredDialog();

  useEffect(() => {
    if (!visible) return;
    let isCurrent = true;
    setPhase({ kind: "loading" });
    setPin("");
    setPinError(null);
    fetchApprovers(tenantId, outletId).then((result) => {
      if (!isCurrent) return;
      if (result.status === "offline") setPhase({ kind: "offline" });
      else if (result.status === "error") setPhase({ kind: "error", message: result.message });
      else setPhase({ kind: "pick", approvers: result.approvers });
    });
    return () => {
      isCurrent = false;
    };
  }, [visible, tenantId, outletId]);

  async function submit(approver: ApproverChoice) {
    if (pin.length < MIN_PIN_LENGTH || isChecking) return;
    setIsChecking(true);
    setPinError(null);
    try {
      const result = await requestApproval({
        tenantId,
        approverUserId: approver.userId,
        pin,
        reduction,
        outletId,
        claimants,
      });
      if (result.status === "approved") {
        onApproved({ approvalId: result.approvalId, approverName: result.approverName, approvedReduction: reduction });
        return;
      }
      if (result.status === "offline") {
        setPhase({ kind: "offline" });
        return;
      }
      setPin("");
      setPinError(result.message);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, isCentered && centeredDialog.backdrop]}>
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Manager approval</Text>
              <Text style={styles.title}>{formatPeso(reduction)} off</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {phase.kind === "loading" ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}

            {phase.kind === "offline" ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>Can’t reach the server</Text>
                <Text style={styles.noticeBody}>
                  The PIN can’t be checked offline. You can continue — the discount is still given and
                  the owner will see it marked “approval skipped offline”.
                </Text>
                <TouchableOpacity style={styles.primary} onPress={onSkipOffline} accessibilityRole="button">
                  <Text style={styles.primaryText}>Continue without approval</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {phase.kind === "error" ? <Text style={styles.error}>{phase.message}</Text> : null}

            {phase.kind === "pick" ? (
              phase.approvers.length === 0 ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>No one can approve yet</Text>
                  <Text style={styles.noticeBody}>
                    The owner can give a manager “Approve & Review Discounts” and set a PIN in
                    Settings → Tax & discounts.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.prompt}>Who is approving?</Text>
                  {phase.approvers.map((approver) => (
                    <TouchableOpacity
                      key={approver.userId}
                      style={[styles.person, !approver.hasPin && styles.personMuted]}
                      onPress={() => approver.hasPin && setPhase({ kind: "pin", approvers: phase.approvers, approver })}
                      disabled={!approver.hasPin}
                      accessibilityRole="button"
                      accessibilityLabel={approver.hasPin ? `Approve as ${approver.name}` : `${approver.name} has no PIN`}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{approver.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.personName}>{approver.name}</Text>
                      <Text style={styles.personMeta}>{approver.hasPin ? "›" : "No PIN set"}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )
            ) : null}

            {phase.kind === "pin" ? (
              <View style={styles.pinWrap}>
                <TouchableOpacity
                  onPress={() => setPhase({ kind: "pick", approvers: phase.approvers })}
                  accessibilityRole="button"
                >
                  <Text style={styles.back}>‹ {phase.approver.name}</Text>
                </TouchableOpacity>
                <Text style={styles.prompt}>Enter your approval PIN</Text>
                <PinPad value={pin} onChange={setPin} isDisabled={isChecking} />
                {pinError ? <Text style={styles.error}>{pinError}</Text> : null}
                <TouchableOpacity
                  style={[styles.primary, (pin.length < MIN_PIN_LENGTH || isChecking) && styles.primaryDisabled]}
                  onPress={() => submit(phase.approver)}
                  disabled={pin.length < MIN_PIN_LENGTH || isChecking}
                  accessibilityRole="button"
                >
                  {isChecking ? (
                    <ActivityIndicator color={colors.card} />
                  ) : (
                    <Text style={styles.primaryText}>Approve</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
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
  headerText: { gap: 2 },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  title: { ...typography.title, color: colors.textPrimary },
  close: { ...typography.body, fontWeight: "600", color: colors.primary },
  body: { gap: spacing.sm, paddingBottom: spacing.lg },
  loading: { paddingVertical: spacing.xxl },
  prompt: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.xs },
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
