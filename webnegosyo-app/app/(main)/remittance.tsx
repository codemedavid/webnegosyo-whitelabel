import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { PinPad, PIN_MIN_LENGTH } from "../../components/cash/PinPad";
import { MONO_FONT } from "../../components/receipt/studio-theme";
import { buildRemittanceSlip } from "../../lib/cash-slips/remittance-slip";
import { printRemittanceSlip, shareRemittanceSlip } from "../../lib/cash-slips/slip-print";
import { slipPlainText } from "../../lib/cash-slips/slip-text";
import { formatPeso } from "../../lib/expenses/keypad";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { isTabletScreen } from "../../lib/screen-size";
import { formatDayLabel } from "../../lib/staff-format";
import { acceptRemittanceByPin } from "../../lib/cash/shift-pin";
import { farewell, remittanceSlipInput, slipBanner, type SlipBanner } from "../../lib/cash/shift-remit-slip";
import { SLIP_NOT_FOUND, useRemittance, useSlipMoves } from "../../lib/cash/shift-remit-read";
import { useShiftDetail } from "../../lib/cash/shift-sales-hooks";
import type { Remittance } from "../../lib/cash/remittances";
import { colors, radius, spacing, typography } from "../../theme/colors";

const DRAWER_ROUTE = "/(main)/pos-sales";

const BANNER_LOOK: Record<SlipBanner["tone"], { icon: "clock" | "check" | "warning"; ink: string; wash: string }> = {
  waiting: { icon: "clock", ink: colors.statusPending.text, wash: colors.warningLight },
  done: { icon: "check", ink: colors.success, wash: colors.successLight },
  problem: { icon: "warning", ink: colors.danger, wash: colors.dangerLight },
};

/**
 * The remittance slip (06 §4.3): who has the cash or who it waits for, the
 * slip itself as it prints, and Print · Share · Done. `?pin=<receiver>` (from
 * End shift's "PIN here now") puts the receiver's PIN pad above the slip so
 * the handover is accepted on this tablet; the cashier's job ends here
 * either way. Opened by remittance id from the inbox too.
 */
export default function RemittanceScreen() {
  const params = useLocalSearchParams<{ id?: string; pin?: string }>();
  const id = typeof params.id === "string" && params.id ? params.id : null;
  const pinFor = typeof params.pin === "string" && params.pin ? params.pin : null;
  const remittance = useRemittance(id);
  const shiftId = remittance.data?.shiftId ?? null;
  const shift = useShiftDetail(shiftId);
  const moves = useSlipMoves(shiftId);

  if (!id) return <Frame><EmptyState icon="info" title="No slip chosen" message="Open a slip from Remittances or after ending a shift." inset /></Frame>;
  if (remittance.isLoading) return <Frame><LoadingState message="Getting the slip…" /></Frame>;
  if (remittance.error) {
    return (
      <Frame>
        <ErrorState title="The slip couldn't load" message={remittance.error} onRetry={() => void remittance.refetch()} />
      </Frame>
    );
  }
  if (!remittance.data) return <Frame><EmptyState icon="info" title="Slip not found" message={SLIP_NOT_FOUND} inset /></Frame>;
  return (
    <SlipBody
      remittance={remittance.data}
      shift={shift.data ?? null}
      moves={moves.data ?? []}
      isPartial={Boolean(shift.error || moves.error)}
      pinFor={pinFor}
      onAccepted={() => void remittance.refetch()}
    />
  );
}

function Frame({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <View style={styles.screen}>
      <BackHeader title="Remittance slip" subtitle={subtitle} />
      {children}
    </View>
  );
}

interface SlipBodyProps {
  remittance: Remittance;
  shift: ReturnType<typeof useShiftDetail>["data"] | null;
  moves: NonNullable<ReturnType<typeof useSlipMoves>["data"]>;
  isPartial: boolean;
  pinFor: string | null;
  onAccepted: () => void;
}

function SlipBody({ remittance, shift, moves, isPartial, pinFor, onAccepted }: SlipBodyProps) {
  const userId = useAuthStore((s) => s.userId);
  const storeName = useAuthStore((s) => s.tenantName) ?? "Store";
  const branchName = useAuthStore((s) => s.outletName) ?? undefined;
  const isTablet = isTabletScreen(useWindowDimensions());
  const [isPrinting, setIsPrinting] = useState(false);

  const input = remittanceSlipInput({ remittance, shift: shift ?? null, moves });
  const store = { storeName, branchName };
  const paper = slipPlainText(buildRemittanceSlip(input, { ...store, width: isTablet ? 48 : 32, printedAt: new Date() }));
  const banner = slipBanner(remittance);
  const look = BANNER_LOOK[banner.tone];
  const thanks = farewell(remittance, userId);
  const day = remittance.businessDay ? formatDayLabel(remittance.businessDay, new Date().toISOString()) : null;
  const subtitle = [remittance.cashierName, remittance.shift?.drawerName, day].filter(Boolean).join(" · ");

  const print = async () => {
    setIsPrinting(true);
    try {
      const outcome = await printRemittanceSlip(input, store);
      if (!outcome.ok) Alert.alert("Couldn't print", outcome.message);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Frame subtitle={subtitle}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.banner, { backgroundColor: look.wash }]} accessibilityRole="summary">
          <Icon name={look.icon} size={18} color={look.ink} />
          <View style={styles.bannerCopy}>
            <Text style={[styles.bannerTitle, { color: look.ink }]}>{banner.title}</Text>
            {banner.detail ? <Text style={styles.bannerDetail}>{banner.detail}</Text> : null}
          </View>
        </View>

        {pinFor && remittance.status === "pending" && remittance.handedOverCents !== null ? (
          <PinAccept remittance={remittance} receiverUserId={pinFor} onAccepted={onAccepted} />
        ) : null}

        {isPartial ? <Text style={styles.note}>{"Some lines couldn’t be read, so they print as “--”."}</Text> : null}
        <View style={styles.paper} testID="remittance-paper">
          <Text style={styles.paperText} selectable>
            {paper}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label="Print" icon="printer" tone="secondary" size="lg" fullWidth={false} style={styles.action} isLoading={isPrinting} onPress={() => void print()} />
          <Button label="Share" icon="export" tone="secondary" size="lg" fullWidth={false} style={styles.action} onPress={() => void shareRemittanceSlip(input, store)} />
        </View>
        <Button label="Done" size="lg" onPress={() => (router.canGoBack() ? router.back() : router.replace(DRAWER_ROUTE as never))} />
        {thanks ? <Text style={styles.thanks}>{thanks}</Text> : null}
      </ScrollView>
    </Frame>
  );
}

/** The receiver types their PIN here; the web route checks it with the approver-PIN limits. */
function PinAccept({ remittance, receiverUserId, onAccepted }: { remittance: Remittance; receiverUserId: string; onAccepted: () => void }) {
  const isOffline = useConnectivity().status === "offline";
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = remittance.handedOverCents ?? 0;
  const name = remittance.remittedToName ?? "Receiver";

  const accept = async () => {
    setBusy(true);
    const outcome = await acceptRemittanceByPin({ remittanceId: remittance.id, receiverUserId, pin, receivedCents: amount });
    setBusy(false);
    setPin("");
    if (outcome.kind === "accepted" || outcome.kind === "not_pending") return onAccepted();
    if (outcome.kind === "locked" || outcome.kind === "no_pin") return setLockout(outcome.message);
    setError(outcome.message);
  };

  return (
    <View style={styles.pinCard} testID="remittance-pin">
      <PinPad
        value={pin}
        onChange={(next) => {
          setError(null);
          setPin(next);
        }}
        title={`${name}, type your PIN to accept ${formatPeso(amount)}`}
        error={isOffline ? "PIN here now needs a connection. They can accept on their phone." : error}
        lockoutMessage={lockout}
        isDisabled={busy || isOffline || lockout !== null}
      />
      <Button
        label={`Accept ${formatPeso(amount)}`}
        size="lg"
        isLoading={busy}
        disabled={pin.length < PIN_MIN_LENGTH || isOffline || lockout !== null}
        onPress={() => void accept()}
      />
      <Text style={styles.note}>Or leave it: {name} can accept on their phone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 2, gap: spacing.md, maxWidth: 640, width: "100%", alignSelf: "center" },
  banner: { flexDirection: "row", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg, alignItems: "flex-start" },
  bannerCopy: { flex: 1, gap: 2 },
  bannerTitle: { ...typography.body, fontWeight: "800" },
  bannerDetail: { ...typography.caption, color: colors.textMuted },
  pinCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.separator },
  paper: { backgroundColor: colors.card, borderRadius: radius.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.separator },
  paperText: { fontFamily: MONO_FONT, fontSize: 13, lineHeight: 18, color: colors.textPrimary },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
  note: { ...typography.caption, color: colors.textMuted },
  thanks: { ...typography.body, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
});
