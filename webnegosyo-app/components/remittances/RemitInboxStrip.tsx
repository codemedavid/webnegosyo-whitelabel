import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { tradingDayOf, tradingDayWindow } from "../../lib/business-day/trading-day";
import { useTradingDay } from "../../lib/business-day/use-trading-day";
import { canManageCash } from "../../lib/cash-drawers";
import { overdueShifts, receiverSummary } from "../../lib/cash/remittances";
import { readyToClose } from "../../lib/cash/day-close-view";
import { useDayToClose } from "../../lib/cash/use-day-close";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { DEFAULT_CASH_SETTINGS } from "../../lib/cash/settings";
import { useCashSettings } from "../../lib/cash/use-cash-rules";
import { useOpenShifts, useRemittanceRefresh, useRemittances } from "../../lib/cash/use-remittances";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import type { ShiftRecord } from "../../lib/shift-service";
import { useAuthStore } from "../../stores/auth-store";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { ForceCloseShiftSheet } from "./ForceCloseShiftSheet";

interface RemitInboxStripProps {
  onOpenRemittances: () => void;
  /** "Friday is ready to close" → the day close for that business day. */
  onOpenDayClose: (dayKey: string, outletId: string | null) => void;
}

/**
 * Home, for whoever receives cash (06 §3): "2 remits to accept · ₱14,725"
 * and "Ben's shift on Cashier 2 is still open (11h)" with End it. Draws
 * nothing when there is nothing to do, and nothing for anyone who cannot
 * receive cash — a cashier's own line is ShiftStatusStrip's.
 */
export function RemitInboxStrip({ onOpenRemittances, onOpenDayClose }: RemitInboxStripProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const isReceiver = !isDemo && canManageCash({ role, isOwner, permissions });
  const accountOutletId = useAuthStore((s) => s.outletId);
  const selectedOutletId = useBranchContextStore((s) => s.selectedOutletId);
  const outletId = accountOutletId ?? selectedOutletId ?? null;

  const remittances = useRemittances(tenantId, isReceiver);
  const openShifts = useOpenShifts(tenantId, isReceiver);
  const settings = useCashSettings(isReceiver ? tenantId : null);
  const { schedule, todayKey } = useTradingDay();
  const dayToClose = useDayToClose(tenantId, outletId, todayKey, isReceiver);
  const ready = dayToClose.status ? readyToClose(dayToClose.status) : null;
  const refresh = useRemittanceRefresh(tenantId);
  const { status } = useConnectivity();
  const [ending, setEnding] = useState<ShiftRecord | null>(null);
  const [nowMs] = useState(() => Date.now());

  const summary = useMemo(() => receiverSummary(remittances.data ?? []), [remittances.data]);
  const overdue = useMemo(() => {
    const grace = (settings.data ?? DEFAULT_CASH_SETTINGS).overdueGraceMinutes;
    const dayEndMsOf = (iso: string) => Date.parse(tradingDayWindow(tradingDayOf(iso, schedule), schedule).endIso);
    return overdueShifts(openShifts.data ?? [], dayEndMsOf, grace, nowMs, userId);
  }, [openShifts.data, settings.data, schedule, nowMs, userId]);

  if (!isReceiver || (!summary && overdue.length === 0 && !ready)) return null;

  return (
    <View style={styles.wrap}>
      {summary ? (
        <StripRow
          icon="wallet"
          tone="accent"
          title={summary.line}
          actionLabel="Review"
          onPress={onOpenRemittances}
          isPrimary
        />
      ) : null}
      {overdue.slice(0, 2).map((item) => (
        <StripRow
          key={item.shift.id}
          icon="clock"
          tone="warn"
          title={item.line}
          detail="End their shift? Whoever takes the cash counts it."
          actionLabel="End it"
          onPress={() => setEnding(item.shift)}
        />
      ))}
      {ready ? (
        <StripRow
          icon="calendar"
          tone="warn"
          title={ready.title}
          detail={ready.detail}
          actionLabel="Close"
          onPress={() => onOpenDayClose(dayToClose.dayKey, outletId)}
        />
      ) : null}
      {ending ? (
        <ForceCloseShiftSheet
          shift={ending}
          isOffline={status === "offline"}
          nowMs={nowMs}
          onDone={() => {
            setEnding(null);
            void refresh();
          }}
          onClose={() => setEnding(null)}
        />
      ) : null}
    </View>
  );
}

interface StripRowProps {
  icon: IconName;
  tone: "accent" | "warn";
  title: string;
  detail?: string;
  actionLabel: string;
  onPress: () => void;
  isPrimary?: boolean;
}

function StripRow({ icon, tone, title, detail, actionLabel, onPress, isPrimary = false }: StripRowProps) {
  const well = tone === "accent" ? styles.wellAccent : styles.wellWarn;
  const ink = tone === "accent" ? colors.accent : colors.statusPending.text;
  return (
    <View style={styles.strip}>
      <View style={[styles.well, well]}>
        <Icon name={icon} size={18} color={ink} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Button label={actionLabel} size="sm" tone={isPrimary ? "primary" : "secondary"} onPress={onPress} accessibilityLabel={`${actionLabel}: ${title}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 60,
    ...shadow.sm,
  },
  well: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  wellAccent: { backgroundColor: colors.accentLight },
  wellWarn: { backgroundColor: colors.warningLight },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textMuted },
});
