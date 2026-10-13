import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { canAskForApproval, isApprovalsStore } from "../../lib/approvals/access";
import { formatPesoShort } from "../../lib/approvals/state";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { usePosCartStore } from "../../stores/pos-cart-store";
import { useAuthStore } from "../../stores/auth-store";
import { spacing } from "../../theme/colors";
import { Button } from "../Button";
import { RequestSheet } from "./RequestSheet";

export type AskManagerRefundMode =
  /** Decided before saving: the edit is NOT saved; the approval refunds the amount and lowers the total. */
  | "instead_of_edit"
  /** The edit was saved but the database refused the refund row: ask for exactly that amount. */
  | "after_saved_edit";

interface AskManagerRefundProps {
  mode: AskManagerRefundMode;
  orderId: string;
  outletId: string | null;
  /** The refund the edit came to. */
  amount: number;
  /** What the order was before the edit: the most that can go back. */
  paidTotal: number;
}

/**
 * The register's refund-blocked state: instead of a dead end, ask a manager
 * for the refund as an amount. Decided BEFORE the edit is saved (the edit is
 * then not saved — the approval itself gives the money back and lowers the
 * total), or, after a race where the database refused the refund row of a
 * saved edit, a one-tap ask for exactly that overpayment (scope 'balance':
 * no revision, the already-lowered total is left alone). Either way the register
 * is cleared and the order screen — where the answer arrives — opens.
 * Platform stores only.
 */
export function AskManagerRefund({ mode, orderId, outletId, amount, paidTotal }: AskManagerRefundProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const { status } = useConnectivity();
  const [isOpen, setOpen] = useState(false);
  const user = { role, isOwner, permissions };

  if (isDemo || !tenantId || !isApprovalsStore({ orderBackend }) || !canAskForApproval(user)) return null;

  return (
    <View style={styles.wrap}>
      <Button
        label={mode === "after_saved_edit" ? `Ask a manager for ${formatPesoShort(amount)}` : "Ask a manager to approve"}
        icon="send"
        tone={mode === "after_saved_edit" ? "primary" : "secondary"}
        onPress={() => setOpen(true)}
      />
      {isOpen ? (
        <RequestSheet
          visible
          kind="refund"
          order={{
            orderId,
            orderLabel: null,
            // After a saved edit the order is OVERPAID by exactly `amount`: that is all that can go back.
            refundable: mode === "after_saved_edit" ? amount : paidTotal,
            paymentLabel: null,
            createdAt: null,
            outletId,
            items: [],
          }}
          seed={{ scope: mode === "after_saved_edit" ? "balance" : "amount", amount }}
          contextNote={
            mode === "after_saved_edit"
              ? `Your edit is saved. This asks a manager to give back the ${formatPesoShort(amount)} overpayment. The order's total stays as it is.`
              : `Your item changes are not saved. When a manager approves, ${formatPesoShort(amount)} goes back and the order's total drops by the same amount.`
          }
          tenantId={tenantId}
          user={user}
          userId={userId}
          isOffline={status === "offline"}
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            usePosCartStore.getState().reset();
            router.push(`/(main)/order/${orderId}` as never);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
});
