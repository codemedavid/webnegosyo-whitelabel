import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { predictRoute, whoWillBeAsked } from "../../lib/approvals/access";
import { approvalsApi, newIdempotencyKey, OFFLINE_MESSAGE, type ApprovalsApi } from "../../lib/approvals/api";
import {
  checkDraft,
  draftAmount,
  initialDraft,
  sheetSubtitle,
  submitLabel,
  withNote,
  withReason,
  withRestock,
  type RequestDraft,
  type RequestOrder,
  type RequestSheetKind,
} from "../../lib/approvals/request-draft";
import { REASONS_BY_KIND, type CreateApprovalResult, type RefundScope } from "../../lib/approvals/types";
import { useApprovalRules, useInvalidateApprovals } from "../../lib/approvals/use-approvals";
import type { StaffPermissionHolder } from "../../lib/staff-permissions";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";
import { Icon } from "../Icon";
import { ReasonPicker } from "./ReasonPicker";
import { RefundScopePicker } from "./RefundScopePicker";

const TITLES: Readonly<Record<RequestSheetKind, string>> = { refund: "Refund", cancel_paid: "Cancel a paid order" };

export interface RequestSheetProps {
  visible: boolean;
  kind: RequestSheetKind;
  order: RequestOrder;
  tenantId: string;
  user: StaffPermissionHolder;
  userId: string | null;
  isOffline: boolean;
  /** Opens on this scope/amount (e.g. the register's refund difference). */
  seed?: { scope?: RefundScope; amount?: number };
  /** One extra line under the header, when the entry point needs to say something. */
  contextNote?: string | null;
  onClose: () => void;
  onSent: (result: CreateApprovalResult) => void;
  api?: ApprovalsApi;
}

/**
 * The cashier's refund / paid-cancel sheet (design-spec §3.8). One retry key
 * is minted when the sheet OPENS and reused on every retry, so a double tap
 * or a lost answer files one request. The button names the outcome: "Send
 * for approval · ₱185", or "Refund ₱185 now" when the rules let this person
 * act directly — the server decides and the create response says which.
 */
export function RequestSheet(props: RequestSheetProps) {
  const { visible, kind, order, tenantId, user, userId, isOffline, seed, contextNote, onClose, onSent, api = approvalsApi } = props;
  const [draft, setDraft] = useState<RequestDraft>(() => initialDraft(kind, seed));
  const [isSending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());
  const rules = useApprovalRules(tenantId, visible, api);
  const invalidate = useInvalidateApprovals(tenantId);

  // Every opening is a fresh request with its own retry key.
  useEffect(() => {
    if (!visible) return;
    setDraft(initialDraft(kind, seed));
    setError(null);
    idempotencyKey.current = newIdempotencyKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset once per opening, not on every seed identity
  }, [visible, kind]);

  const amount = draftAmount(draft, order);
  const check = checkDraft(draft, order, idempotencyKey.current);
  const route = predictRoute({ user, kind, amount, rules: rules.data?.rules ?? null, now: new Date(), orderCreatedAt: order.createdAt });
  const who =
    route === "request" && rules.data
      ? whoWillBeAsked({ approvers: rules.data.approvers, outletId: order.outletId, amount, rules: rules.data.rules, selfUserId: userId })
      : null;
  const hint = isOffline ? OFFLINE_MESSAGE : check.ok ? null : check.hint;
  const hasItems = kind === "cancel_paid" || draft.scope !== "amount";

  const send = async () => {
    if (!check.ok || isSending || isOffline) return;
    setSending(true);
    setError(null);
    const result = await api.create(tenantId, check.input);
    setSending(false);
    if (!result.ok) {
      setError(result.status === 0 ? OFFLINE_MESSAGE : result.error);
      return;
    }
    await invalidate();
    onSent(result.data);
  };

  return (
    <DrawerSheet visible={visible} title={TITLES[kind]} subtitle={sheetSubtitle(order)} onClose={onClose} isBusy={isSending} closeLabel="Close">
      {contextNote ? <Text style={styles.contextNote}>{contextNote}</Text> : null}
      {kind === "refund" ? <RefundScopePicker draft={draft} order={order} onChange={setDraft} /> : null}
      <ReasonPicker
        reasons={REASONS_BY_KIND[kind]}
        reasonCode={draft.reasonCode}
        note={draft.note}
        notePlaceholder="Add a detail (optional)"
        onReason={(code) => setDraft((current) => withReason(current, code))}
        onNote={(note) => setDraft((current) => withNote(current, note))}
        restock={hasItems ? { value: draft.restock, onChange: (value) => setDraft((current) => withRestock(current, value)) } : undefined}
      />
      {who ? (
        <View style={styles.callout}>
          <Icon name="bell" size={18} color={colors.statusPending.text} />
          <Text style={styles.calloutText}>
            <Text style={styles.calloutStrong}>Needs approval. </Text>
            {`${who} You'll see the answer on this order.`}
          </Text>
        </View>
      ) : null}
      <View style={styles.dock}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <Button
          label={submitLabel(kind, amount, route)}
          size="lg"
          onPress={() => void send()}
          disabled={!check.ok || isOffline}
          isLoading={isSending}
          accessibilityHint={hint ?? undefined}
        />
      </View>
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  contextNote: { ...typography.caption, color: colors.textMuted },
  callout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.statusPending.bg,
    marginTop: spacing.sm,
  },
  calloutText: { ...typography.caption, color: colors.statusPending.text, flex: 1 },
  calloutStrong: { fontWeight: "700" },
  dock: { marginTop: spacing.lg, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600", textAlign: "center" },
});
