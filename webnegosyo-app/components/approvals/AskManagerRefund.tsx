import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { canAskForApproval, isApprovalsStore } from "../../lib/approvals/access";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { usePosCartStore } from "../../stores/pos-cart-store";
import { useAuthStore } from "../../stores/auth-store";
import { spacing } from "../../theme/colors";
import { Button } from "../Button";
import { RequestSheet } from "./RequestSheet";

interface AskManagerRefundProps {
  orderId: string;
  outletId: string | null;
  /** The refund the edit came to. */
  amount: number;
  /** What the order was before the edit: the most that can go back. */
  paidTotal: number;
}

/**
 * The register's refund-blocked state (no "Refunds" grant): instead of a
 * dead end, ask a manager. The request is for the difference as an amount;
 * the edit itself is not saved, so the register is cleared and the order
 * screen — where the answer arrives — opens. Platform stores only.
 */
export function AskManagerRefund({ orderId, outletId, amount, paidTotal }: AskManagerRefundProps) {
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
      <Button label="Ask a manager to approve" icon="send" tone="secondary" onPress={() => setOpen(true)} />
      {isOpen ? (
        <RequestSheet
          visible
          kind="refund"
          order={{ orderId, orderLabel: null, refundable: paidTotal, paymentLabel: null, createdAt: null, outletId, items: [] }}
          seed={{ scope: "amount", amount }}
          contextNote="Your item changes are not saved. This asks for the money back as an amount; the order keeps its items."
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
