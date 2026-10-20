import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { formatPeso } from "../../../lib/format";
import { maskIdNumber } from "../../../lib/gov-discount";
import { appliedGovernment, type PosSessionDiscount } from "../../../lib/pos-discount-session";
import {
  EMPTY_GOV_SESSION,
  govApprovalPending,
  withApproval,
  withOfflineSkip,
} from "../../../lib/pos-gov-discount";
import { usePosCartStore } from "../../../stores/pos-cart-store";
import { useGovDiscountContextStore } from "../../../stores/gov-discount-context-store";
import { useAuthStore } from "../../../stores/auth-store";
import { ManagerApprovalSheet } from "./ManagerApprovalSheet";

export interface TenderGovApprovalState {
  isPending: boolean;
  reduction: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * Whether the sale on the tender screen still needs a manager for its
 * Senior/PWD discount — e.g. the cart grew after the PIN was given, so the
 * approved amount no longer covers it.
 */
export function useTenderGovApproval(discount: PosSessionDiscount): TenderGovApprovalState {
  const [isOpen, setIsOpen] = useState(false);
  const profile = useGovDiscountContextStore((s) => s.profile);
  const session = usePosCartStore((s) => s.discount.government) ?? EMPTY_GOV_SESSION;
  const reduction = appliedGovernment(discount)?.result.totalReduction ?? 0;
  const isPending = reduction > 0 && govApprovalPending(session, profile, reduction);
  return { isPending, reduction, isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}

/** The tender screen's "needs a manager" strip and its PIN sheet. */
export function TenderGovApproval({ approval }: { approval: TenderGovApprovalState }) {
  const tenantId = useAuthStore((s) => s.tenantId);
  const session = usePosCartStore((s) => s.discount.government) ?? EMPTY_GOV_SESSION;
  const setGovernment = usePosCartStore((s) => s.setGovernment);
  const outletId = usePosCartStore((s) => s.editContext?.outletId ?? s.saleOutlet?.id ?? null);

  if (!approval.isPending || !tenantId) return null;

  return (
    <View style={styles.strip}>
      <View style={styles.text}>
        <Text style={styles.title}>Manager approval needed</Text>
        <Text style={styles.body}>
          The Senior/PWD discount ({formatPeso(approval.reduction)}) is above the store’s limit.
        </Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={approval.open} accessibilityRole="button">
        <Text style={styles.buttonText}>Ask a manager</Text>
      </TouchableOpacity>

      <ManagerApprovalSheet
        visible={approval.isOpen}
        tenantId={tenantId}
        outletId={outletId}
        reduction={approval.reduction}
        claimants={session.claimants.map((claimant) => ({
          kind: claimant.kind,
          name: claimant.name,
          idMasked: maskIdNumber(claimant.idNumber),
        }))}
        onApproved={(granted) => {
          setGovernment(withApproval(session, granted));
          approval.close();
        }}
        onSkipOffline={() => {
          setGovernment(withOfflineSkip(session));
          approval.close();
        }}
        onClose={approval.close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  text: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  body: { ...typography.caption, color: colors.textPrimary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  buttonText: { ...typography.caption, fontWeight: "700", color: colors.card },
});
