import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";
import { DEMO_READONLY_MESSAGE } from "../lib/demo";
import { withDeadline } from "../lib/offline/deadline";
import { judgeCount, parseCashInput, validateCashAmount, type ShiftReconciliation } from "../lib/shift";
import { closeShift, isShiftStillOpen, openShift, type ShiftRecord } from "../lib/shift-service";
import { listCashMoves, recordCashMove } from "../lib/cash-drawer-service";
import { canManageCash, drawerBoard, type CashMoveKind } from "../lib/cash-drawers";
import { expectDrawer, type DrawerExpectationRead, type ExpectationSources } from "../lib/drawer-expectation";
import { useCashFloor } from "../lib/use-cash-floor";
import { OrderSettlementReader, type StaffPayment } from "./OrderSettlementReader";
import type { CounterSale } from "../lib/pos-sales";
import { formatPeso } from "../lib/format";
import { listOrderActivity } from "../lib/staff-activity/activity-service";
import { describeActivity, summarizeActorActivity, type OrderActivityEvent } from "../lib/staff-activity/activity";
import { ClockInCard } from "./drawer/ClockInCard";
import { MyShiftCard } from "./drawer/MyShiftCard";
import { DrawersOverview, type FloorRow } from "./drawer/DrawersOverview";
import { CashMoveSheet, type CashMoveTarget } from "./drawer/CashMoveSheet";
import { CountDrawerSheet, type CountTarget } from "./drawer/CountDrawerSheet";

/** The session read only names the shift; it must never hold up the clock-in. */
const SESSION_READ_MS = 5_000;
/** How often the "3h 12m" on open drawers is re-read from the clock. */
const TICK_MS = 60_000;
const CASH_SETUP_ROUTE = "/(main)/cash-drawers";

/**
 * Clock in / clock out, cash in / out, and — for an owner or manager — every
 * drawer on the floor, on the Drawer screen: the shift starts and ends where
 * the money does.
 *
 * The screen lends this the same newest-first page of orders the day totals
 * fetched, so the two can never disagree about a sale. `pageLimit` is the
 * size of that page: whether it covers a shift is judged against the shift's
 * own start (isShiftHistoryComplete).
 */
export function ShiftCard({ orders, pageLimit }: { orders: readonly CounterSale[]; pageLimit: number }) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  return (
    <OrderSettlementReader key={`${tenantId}:${userId}`} ids={orders.map((order) => order._id)}>
      {(payments, ready, error) => (
        <ShiftCardContent orders={orders} payments={payments} pageLimit={pageLimit} ledgerReady={ready} ledgerError={error} />
      )}
    </OrderSettlementReader>
  );
}

/** The name snapshotted onto the shift; falls back rather than blocking. */
async function readStaffName(): Promise<string> {
  try {
    const { data } = await withDeadline(supabase.auth.getSession(), SESSION_READ_MS);
    const user = data.session?.user;
    return (user?.user_metadata?.display_name as string | undefined) || user?.email || "Staff";
  } catch (error) {
    console.warn("[shift] session unavailable for the staff name", error);
    return "Staff";
  }
}

function describeClose(rec: ShiftReconciliation, isZeroBalance: boolean): string {
  const variance = rec.variance ?? 0;
  const verdictLine =
    rec.verdict === "balanced"
      ? "The drawer balanced."
      : rec.verdict === "short"
        ? `The drawer is short ${formatPeso(Math.abs(variance))}.`
        : `The drawer is over ${formatPeso(variance)}.`;
  const handOver = formatPeso(rec.handOver ?? rec.expectedTurnover);
  const keep = isZeroBalance ? "The drawer ends empty." : `Leave ${formatPeso(rec.floatToKeep)} in the drawer.`;
  return `Hand over ${handOver}. ${keep} ${verdictLine}`;
}

function refuseInDemo(): boolean {
  if (!useAuthStore.getState().isDemo) return false;
  Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
  return true;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Try again.";
}

interface ContentProps {
  orders: readonly CounterSale[];
  payments: StaffPayment[];
  pageLimit: number;
  ledgerReady: boolean;
  ledgerError: string | null;
}

function ShiftCardContent({ orders, payments, pageLimit, ledgerReady, ledgerError }: ContentProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const canManage = canManageCash({ role, isOwner, permissions });

  const floor = useCashFloor();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  // State lands a render late: two taps inside one frame both saw `busy`
  // false and both wrote. The ref is read synchronously.
  const inFlight = useRef(false);
  const [moveTarget, setMoveTarget] = useState<CashMoveTarget | null>(null);
  const [countTarget, setCountTarget] = useState<(CountTarget & { shift: ShiftRecord }) | null>(null);
  // What this person did to web orders during the shift. Read separately
  // from the drawer and never added to it: a confirmed web order is the
  // store's money, not this drawer's (shift-drawer.ts).
  const [activity, setActivity] = useState<OrderActivityEvent[] | null>(null);

  const myShift = floor.myShift;

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setNowMs(Date.now());
      if (!tenantId || !userId || !myShift) {
        setActivity(null);
        return;
      }
      let active = true;
      listOrderActivity(tenantId, { sinceIso: myShift.openedAt, actorUserId: userId })
        .then((events) => active && setActivity(events))
        .catch((error) => {
          console.warn("[shift] activity unavailable", error);
          if (active) setActivity(null);
        });
      return () => {
        active = false;
      };
    }, [tenantId, userId, myShift]),
  );

  const sources: ExpectationSources = useMemo(
    () => ({
      orders,
      payments,
      pageLimit,
      ledgerReady,
      // A move read that failed must block reconciling, not read as "no moves".
      ledgerError: ledgerError ?? (floor.moves === null && floor.error ? floor.error : null),
      moves: floor.moves,
      nowMs,
    }),
    [orders, payments, pageLimit, ledgerReady, ledgerError, floor.moves, floor.error, nowMs],
  );

  const myExpectation: DrawerExpectationRead | null = useMemo(
    () => (myShift ? expectDrawer(myShift, sources) : null),
    [myShift, sources],
  );

  const floorRows: FloorRow[] = useMemo(
    () =>
      floor.openShifts.map((shift) => ({
        shift,
        expectation: expectDrawer(shift, sources),
        isMine: shift.id === myShift?.id,
      })),
    [floor.openShifts, sources, myShift],
  );

  const board = useMemo(
    () => drawerBoard(floor.drawers, floor.openShifts.map((s) => ({ shiftId: s.id, drawerId: s.drawerId, staffUserId: s.staffUserId, staffName: s.staffName })), userId),
    [floor.drawers, floor.openShifts, userId],
  );

  const activityLine = useMemo(() => {
    if (!myShift || !userId || !activity) return null;
    const summary = summarizeActorActivity(activity, userId, {
      startMs: Date.parse(myShift.openedAt),
      endMs: nowMs,
    });
    const line = describeActivity(summary);
    return summary.confirmedTotal > 0 ? `${line} (${formatPeso(summary.confirmedTotal)} confirmed, not in drawer)` : line;
  }, [myShift, userId, activity, nowMs]);

  const runExclusive = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleClockIn = (drawerId: string | null, floatText: string) =>
    runExclusive(async () => {
      if (refuseInDemo() || !tenantId || !userId) return;
      if (floor.needsBranch) {
        Alert.alert("Choose a branch", "Select the branch whose drawer you are opening.");
        return;
      }
      // A blank float is a deliberate "the drawer starts empty".
      const float = validateCashAmount(floatText.trim() ? parseCashInput(floatText) : 0);
      if (!float.ok) {
        Alert.alert("Starting cash", float.reason);
        return;
      }
      try {
        // The name is snapshotted onto the shift so deleting the account later
        // keeps the history named.
        await openShift(tenantId, {
          outletId: floor.outletId,
          staffUserId: userId,
          staffName: await readStaffName(),
          openingFloat: float.amount,
          drawerId,
        });
      } catch (error) {
        Alert.alert("Could not start the shift", errorText(error));
      }
      await floor.reload();
    });

  const openMoveSheet = (shift: ShiftRecord, expectation: DrawerExpectationRead, kinds: readonly CashMoveKind[]) => {
    const ready = expectation.state === "ready" ? expectation.value.reconciliation : null;
    const isMine = shift.id === myShift?.id;
    setMoveTarget({
      shiftId: shift.id,
      title: isMine ? "Cash in / out" : `Collect from ${shift.staffName}`,
      subtitle: `${shift.drawerName ?? (isMine ? "My drawer" : "Personal drawer")}${shift.isZeroBalance ? " · Zero balance" : ""}`,
      kinds,
      expectedInDrawer: ready?.expectedInDrawer ?? null,
      floatToKeep: ready?.floatToKeep ?? (shift.isZeroBalance ? 0 : shift.openingFloat),
    });
  };

  const handleMove = (move: { kind: CashMoveKind; amount: number; reason: string }) =>
    runExclusive(async () => {
      if (refuseInDemo() || !tenantId || !moveTarget) return;
      try {
        // Re-read this drawer's moves first, like the close does: a pickup
        // recorded on another tablet since the sheet opened would otherwise
        // let the same cash be collected twice.
        const shift = floor.openShifts.find((s) => s.id === moveTarget.shiftId) ??
          (myShift?.id === moveTarget.shiftId ? myShift : null);
        const fresh = shift
          ? expectDrawer(shift, { ...sources, moves: await listCashMoves(tenantId, [shift.id]), nowMs: Date.now() })
          : null;
        const expectedInDrawer =
          fresh?.state === "ready" ? fresh.value.reconciliation.expectedInDrawer : moveTarget.expectedInDrawer;
        await recordCashMove(tenantId, {
          ...move,
          shiftId: moveTarget.shiftId,
          recordedByName: await readStaffName(),
          expectedInDrawer,
        });
        setMoveTarget(null);
        await floor.reload();
      } catch (error) {
        Alert.alert("Could not record it", errorText(error));
      }
    });

  const openCountSheet = (shift: ShiftRecord, expectation: DrawerExpectationRead) => {
    const ready = expectation.state === "ready" ? expectation.value.reconciliation : null;
    const isMine = shift.id === myShift?.id;
    setCountTarget({
      shift,
      title: isMine ? "End shift" : `Close ${shift.staffName}'s drawer`,
      subtitle: `${shift.drawerName ?? "Personal drawer"}${shift.isZeroBalance ? " · Zero balance" : ""} · count every peso in it`,
      expectedInDrawer: ready?.expectedInDrawer ?? null,
      floatToKeep: ready?.floatToKeep ?? 0,
      isZeroBalance: shift.isZeroBalance,
      blockedReason:
        expectation.state === "unavailable"
          ? expectation.reason
          : expectation.state === "loading"
            ? "Still adding up this drawer's sales. Try again in a moment."
            : null,
    });
  };

  const finishClose = async (shift: ShiftRecord, rec: ShiftReconciliation) => {
    setCountTarget(null);
    setActivity(null);
    await floor.reload();
    const who = shift.id === myShift?.id ? "Shift ended" : `${shift.staffName}'s shift closed`;
    Alert.alert(who, describeClose(rec, shift.isZeroBalance));
  };

  const handleCount = (counted: number) =>
    runExclusive(async () => {
      if (refuseInDemo() || !tenantId || !countTarget) return;
      const { shift } = countTarget;
      // Re-read this drawer's moves first: a pickup recorded on another
      // tablet since this screen loaded would otherwise read as a shortage.
      let fresh: DrawerExpectationRead;
      try {
        fresh = expectDrawer(shift, { ...sources, moves: await listCashMoves(tenantId, [shift.id]), nowMs: Date.now() });
      } catch (error) {
        Alert.alert("Not ready to close", errorText(error));
        return;
      }
      if (fresh.state !== "ready") {
        Alert.alert("Not ready to close", fresh.state === "unavailable" ? fresh.reason : "Settlement history is still loading. Try again in a moment.");
        return;
      }
      const rec = fresh.value.reconciliation;
      const final: ShiftReconciliation = { ...rec, ...judgeCount(rec.expectedInDrawer, rec.floatToKeep, counted) };
      try {
        await closeShift(tenantId, shift.id, {
          closingCount: counted,
          // Frozen at the moment of close; see shift-service.ts.
          expectedCash: rec.expectedInDrawer,
          note: null,
          closedByName: await readStaffName(),
        });
        await finishClose(shift, final);
      } catch (error) {
        // A timed-out close may still have landed. Only a successful read that
        // no longer finds THIS shift open counts as closed — a failed read is
        // not evidence either way.
        const hasLanded = await isShiftStillOpen(tenantId, shift.id)
          .then((open) => !open)
          .catch(() => false);
        if (hasLanded) {
          await finishClose(shift, final);
          return;
        }
        Alert.alert("Could not end the shift", errorText(error));
      }
    });

  if (!floor.isLoaded) return null;

  const notice = floor.needsBranch
    ? "Choose a branch above to see its drawers."
    : floor.error && floor.drawers.length === 0
      ? `Drawers could not be loaded: ${floor.error}`
      : null;

  const freeDrawers = board.filter((slot) => slot.state === "free").map((slot) => slot.drawer);
  const showFloor = canManage && !floor.needsBranch && (floor.drawers.length > 0 || floorRows.some((row) => !row.isMine));

  return (
    <>
      {myShift && myExpectation ? (
        <MyShiftCard
          shift={myShift}
          expectation={myExpectation}
          moves={(floor.moves ?? []).filter((m) => m.shiftId === myShift.id)}
          activityLine={activityLine}
          nowMs={nowMs}
          onCashMove={() => openMoveSheet(myShift, myExpectation, ["pay_out", "pay_in", "collect"])}
          onEndShift={() => openCountSheet(myShift, myExpectation)}
        />
      ) : (
        <ClockInCard
          board={board}
          isBusy={busy}
          canManage={canManage}
          notice={notice}
          onClockIn={(drawerId, floatText) => void handleClockIn(drawerId, floatText)}
          onSetUpDrawers={() => router.push(CASH_SETUP_ROUTE)}
        />
      )}

      {showFloor ? (
        <DrawersOverview
          rows={floorRows}
          freeDrawers={freeDrawers}
          nowMs={nowMs}
          onCollect={(row) => openMoveSheet(row.shift, row.expectation, ["collect"])}
          onCount={(row) => openCountSheet(row.shift, row.expectation)}
          onManage={() => router.push(CASH_SETUP_ROUTE)}
        />
      ) : null}

      {moveTarget ? (
        <CashMoveSheet
          key={moveTarget.shiftId}
          target={moveTarget}
          isBusy={busy}
          onSubmit={(move) => void handleMove(move)}
          onClose={() => setMoveTarget(null)}
        />
      ) : null}
      {countTarget ? (
        <CountDrawerSheet
          key={countTarget.shift.id}
          target={countTarget}
          isBusy={busy}
          onConfirm={(counted) => void handleCount(counted)}
          onClose={() => setCountTarget(null)}
        />
      ) : null}
    </>
  );
}
