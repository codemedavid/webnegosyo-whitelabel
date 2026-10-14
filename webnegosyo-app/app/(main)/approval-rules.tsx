import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ApprovalRulesEditor } from "../../components/approvals/ApprovalRulesEditor";
import { canEditApprovalRules } from "../../lib/approvals/access";
import { approvalsApi } from "../../lib/approvals/api";
import { useApprovalRules, useInvalidateApprovals } from "../../lib/approvals/use-approvals";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { useOutlets } from "../../lib/use-outlets";
import { useAuthStore } from "../../stores/auth-store";
import { colors } from "../../theme/colors";

/**
 * Approval rules — owner only, a utility route (href: null) with a door on
 * the Manage hub. GET/PUT /api/approvals/rules; every change is recorded in
 * Store activity by the server.
 */
export default function ApprovalRulesScreen() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const canEdit = !isDemo && canEditApprovalRules({ role, isOwner, permissions });
  const query = useApprovalRules(tenantId, canEdit);
  const invalidate = useInvalidateApprovals(tenantId);
  const { outlets } = useOutlets();
  const { status } = useConnectivity();

  const body = (() => {
    if (!canEdit || !tenantId) {
      return <EmptyState icon="shield" title="For the owner" message="Only the store owner can change approval rules." />;
    }
    if (query.isLoading) return <LoadingState message="Loading rules..." />;
    if (!query.data) {
      return <ErrorState title="Couldn't load the rules" message={query.error?.message} onRetry={() => void query.refetch()} />;
    }
    return (
      <ApprovalRulesEditor
        rules={query.data.rules}
        approvers={query.data.approvers}
        outletName={(id) => outlets.find((outlet) => outlet.id === id)?.name ?? null}
        isOffline={status === "offline"}
        onOpenTeam={() => router.push("/(main)/team")}
        onSave={async (patch) => {
          const result = await approvalsApi.saveRules(tenantId, patch);
          if (!result.ok) return { ok: false, error: result.error };
          await invalidate();
          return { ok: true };
        }}
      />
    );
  })();

  return (
    <View style={styles.screen}>
      <BackHeader title="Approval rules" subtitle="Refunds, cancels and limits" />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
