import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { AcceptRemittanceSheet, type SheetResult } from "../../components/remittances/AcceptRemittanceSheet";
import { RemittanceDetailSheet } from "../../components/remittances/RemittanceDetailSheet";
import { RemittanceRow } from "../../components/remittances/RemittanceRow";
import { canManageCash } from "../../lib/cash-drawers";
import { remittanceHref } from "../../lib/cash-routes";
import {
  REMITTANCE_COPY,
  acceptRemittance,
  actionsFor,
  disputeRemittance,
  inboxTabs,
  resolveRemittance,
  type Remittance,
} from "../../lib/cash/remittances";
import { liveCashDb } from "../../lib/cash/use-cash-rules";
import { useRemittanceRefresh, useRemittances } from "../../lib/cash/use-remittances";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { isTabAllowed } from "../../lib/staff-permissions";
import { useAuthStore } from "../../stores/auth-store";
import { colors, radius, spacing, typography } from "../../theme/colors";

type Tab = "toAccept" | "accepted" | "pickups";
type Sheet = { kind: "detail" | "accept"; id: string } | null;

const EMPTY: Record<Tab, { title: string; message: string }> = {
  toAccept: { title: "All remittances are in", message: "Nothing to accept." },
  accepted: { title: "Nothing accepted yet", message: "Accepted remittances from the last two weeks show here." },
  pickups: { title: "No pickups", message: "Cash taken out of a drawer during a shift shows here." },
};

const failed = (error: unknown, fallback: string): SheetResult => ({
  ok: false,
  error: error instanceof Error ? error.message : fallback,
});

/**
 * Remittances (06 §4.4): the receiver's inbox — To accept · Accepted ·
 * Pickups. A utility screen opened from Reports (Cash section) and the Home strip,
 * for cash managers (TAB_PERMISSIONS "remittances" = cash_manage). Branch
 * reach is the server's: RLS hands a branch manager only their branch.
 * Every write is a CAS RPC in lib/cash/remittances; a lost race says so.
 */
export default function RemittancesScreen() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const outletName = useAuthStore((s) => s.outletName);
  const caller = { role, isOwner, permissions };
  const isAllowed = isTabAllowed(caller, "remittances");
  const viewer = { userId, isOwner, canManageCash: canManageCash(caller) && !isDemo };

  const { status } = useConnectivity();
  const isOffline = status === "offline";
  const query = useRemittances(tenantId, isAllowed && !isDemo);
  const refreshCache = useRemittanceRefresh(tenantId);
  const [tab, setTab] = useState<Tab>("toAccept");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [isRefreshing, setRefreshing] = useState(false);

  const list = useMemo(() => (isDemo ? [] : query.data ?? []), [isDemo, query.data]);
  const tabs = useMemo(() => inboxTabs(list), [list]);
  const open = sheet ? list.find((r) => r.id === sheet.id) ?? null : null;

  const settle = async (work: () => Promise<Remittance>, fallback: string): Promise<SheetResult> => {
    try {
      await work();
      await refreshCache();
      setSheet(null);
      return { ok: true };
    } catch (error) {
      // A lost race means the row moved: show what it is now.
      if (error instanceof Error && error.message === REMITTANCE_COPY.notPending) await refreshCache();
      return failed(error, fallback);
    }
  };

  const header = <BackHeader title="Remittances" subtitle={outletName ?? "Every branch you can reach"} />;

  if (!isAllowed) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState icon="wallet" title="For cash managers" message="Ask the owner for Cash & day close to accept remittances." />
      </View>
    );
  }

  const rows = tabs[tab];
  let body: React.ReactNode;
  if (!isDemo && query.isLoading) body = <LoadingState message="Loading remittances..." />;
  else if (!isDemo && query.error && query.data === undefined) {
    body = <ErrorState title="Couldn't load remittances" message={query.error} onRetry={() => void query.refetch()} />;
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await query.refetch();
              setRefreshing(false);
            }}
          />
        }
      >
        {isDemo ? <Notice icon="info" text={DEMO_READONLY_MESSAGE} /> : null}
        {isOffline ? <Notice icon="wifi" text={`${REMITTANCE_COPY.offlineAccept} You're offline.`} /> : null}
        {query.error && query.data !== undefined ? <Notice icon="warning" text={`Couldn't refresh. ${query.error}`} /> : null}
        <SegmentedControl
          options={[
            { label: tabs.toAccept.length > 0 ? `To accept (${tabs.toAccept.length})` : "To accept", value: "toAccept" as Tab },
            { label: "Accepted", value: "accepted" as Tab },
            { label: "Pickups", value: "pickups" as Tab },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityPrefix="Show"
        />
        {rows.length === 0 ? (
          <EmptyState icon="wallet" title={EMPTY[tab].title} message={EMPTY[tab].message} inset />
        ) : (
          rows.map((remittance, index) => {
            const actions = actionsFor(remittance, viewer);
            return (
              <RemittanceRow
                key={remittance.id}
                remittance={remittance}
                isFirst={index === 0}
                isOffline={isOffline}
                onOpen={() => setSheet({ kind: "detail", id: remittance.id })}
                onAccept={actions.canAccept ? () => setSheet({ kind: "accept", id: remittance.id }) : undefined}
              />
            );
          })
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      {body}
      {open && sheet?.kind === "detail" ? (
        <RemittanceDetailSheet
          remittance={open}
          actions={actionsFor(open, viewer)}
          isOffline={isOffline}
          onAccept={() => setSheet({ kind: "accept", id: open.id })}
          onResolve={(note) => settle(() => resolveRemittance(liveCashDb, open, note), "It could not be settled.")}
          onOpenSlip={() => {
            setSheet(null);
            router.push(remittanceHref(open.id));
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {open && sheet?.kind === "accept" ? (
        <AcceptRemittanceSheet
          remittance={open}
          isOffline={isOffline}
          onAccept={(cents, note) =>
            settle(() => acceptRemittance(liveCashDb, open, cents, note), "The remittance could not be accepted.")
          }
          onDispute={(reason, cents) =>
            settle(() => disputeRemittance(liveCashDb, open, reason, cents), "The problem could not be reported.")
          }
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

function Notice({ icon, text }: { icon: "info" | "wifi" | "warning"; text: string }) {
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <Icon name={icon} size={16} color={colors.textPrimary} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  notice: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.infoLight },
  noticeText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
});
