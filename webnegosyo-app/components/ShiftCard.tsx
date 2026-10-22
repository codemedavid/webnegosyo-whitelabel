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
import { OrderSettlementReader, type OrderLedger, type StaffPayment } from "./OrderSettlementReader";
import type { CounterSale } from "../lib/pos-sales";
import { formatPeso } from "../lib/format";
import { listOrderActivity } from "../lib/staff-activity/activity-service";
import { describeActivity, summarizeActorActivity, type OrderActivityEvent } from "../lib/staff-activity/activity";
import { ClockInCard } from "./drawer/ClockInCard";
import { MyShiftCard } from "./drawer/MyShiftCard";
import { DrawersOverview, type FloorRow } from "./drawer/DrawersOverview";
import { CashMoveSheet, type CashMoveTarget } from "./drawer/CashMoveSheet";
import { CountDrawerSheet, type CountTarget } from "./drawer/CountDrawerSheet";
import { AddExpenseSheet, type ExpenseSheetScope } from "./expenses/AddExpenseSheet";
import { CloseShiftSheet } from "./drawer/CloseShiftSheet";
import { useDrawerExpenses } from "../lib/expenses/use-drawer-expenses";
import { REFUSED_BLOCKS_CLOSE, payoutLines, summarizeShiftPayouts } from "../lib/expenses/drawer-expenses";
import { formatPeso as formatCentsPeso } from "../lib/expenses/keypad";
import { liveExpenseDb } from "../lib/expenses/expense-client";
import { listMovementLinks, type MovementLink } from "../lib/expenses/expense-service";
import { closedConfirmation, closeReview, hasDrawerChanged, type CloseReview } from "../lib/expenses/money-glance-close";
import { drawerSplitText } from "../lib/expenses/money-glance-drawer";
import { usePayoutLinks } from "../lib/expenses/money-glance-hooks";
import { useCanManageExpenses, useCategoryIndex, useExpenseCategories } from "../lib/expenses/use-expenses";

/** The session read only names the shift; it must never hold up the clock-in. */
const SESSION_READ_MS = 5_000;
/** How often the "3h 12m" on open drawers is re-read from the clock. */
const TICK_MS = 60_000;
const CASH_SETUP_ROUTE = "/(main)/cash-drawers";
/** Expenses, filtered to what was paid from drawers (B1's `view=drawer`). */
const DRAWER_EXPENSES_ROUTE = "/(main)/expenses?view=drawer";
/** Shown on the close sheet when "End shift" found the drawer's figure moved since the count. */
const DRAWER_CHANGED_NOTICE = "The drawer changed while you were counting. Check the new total.";
/** The phone could not read or write its own list of pay-outs: never assume "nothing waiting". */
const SETTLE_FAILED_TEXT = "This phone could not check its drawer pay-outs. Try again in a moment.";
/** The register's "Pay out" with no shift open on this phone. */
const PAY_OUT_NEEDS_SHIFT = "Start a shift to pay from the drawer.";

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
interface ShiftCardProps {
  orders: readonly CounterSale[];
  pageLimit: number;
  /**
   * The settlement ledger, when the screen has already read it for its own
   * totals. Absent, the card reads it itself.
   */
  ledger?: OrderLedger;
  /** The register's "Pay out" asked for the drawer sheet (`?pay=1`). */
  isPayOutRequested?: boolean;
  /** Called once the request was acted on (or cannot be), to clear the param. */
  onPayOutHandled?: () => void;
}

export function ShiftCard({ orders, pageLimit, ledger, isPayOutRequested = false, onPayOutHandled }: ShiftCardProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  if (ledger) {
    return (
      <ShiftCardContent
        key={`${tenantId}:${userId}`}
        orders={orders}
        payments={ledger.payments}
        pageLimit={pageLimit}
        ledgerReady={ledger.ready}
        ledgerError={ledger.error}
        isPayOutRequested={isPayOutRequested}
        onPayOutHandled={onPayOutHandled}
      />
    );
  }
  return (
    <OrderSettlementReader key={`${tenantId}:${userId}`} ids={orders.map((order) => order._id)}>
      {(payments, ready, error) => (
        <ShiftCardContent
          orders={orders}
          payments={payments}
          pageLimit={pageLimit}
          ledgerReady={ready}
          ledgerError={error}
          isPayOutRequested={isPayOutRequested}
          onPayOutHandled={onPayOutHandled}
        />
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
  isPayOutRequested: boolean;
  onPayOutHandled?: () => void;
}

/** The close sheet's review plus what "End shift" writes, frozen together. */
interface PendingClose {
  shift: ShiftRecord;
  expectedInDrawer: number;
  counted: number;
  review: CloseReview;
  /** Set when "End shift" found the drawer changed; the next tap closes. */
  notice: string | null;
}

/**
 * A fresh read of the drawer for a close: the sheet to show (with how many of
 * its pay-outs the store did not take), or why it cannot close yet.
 */
type PreparedClose = { kind: "ready"; pending: PendingClose; refused: number } | { kind: "blocked"; reason: string };

/** "Not ready to close", with a way to try the same step again. */
function alertNotReady(reason: string, retry: () => void): void {
  Alert.alert("Not ready to close", reason, [
    { text: "Not now", style: "cancel" },
    { text: "Try again", onPress: retry },
  ]);
}

function waitingToSyncText(waiting: number): string {
  return `${waiting} drawer ${waiting === 1 ? "expense is" : "expenses are"} still waiting to sync. Connect to the internet, then end the shift.`;
}

/** Which of these pay-outs were expenses; null when that read failed (the sheet then shows one "Paid out" line). */
async function readLinks(tenantId: string, moves: readonly { id: string; kind: string }[]): Promise<ReadonlyMap<string, MovementLink> | null> {
  const ids = moves.filter((move) => move.kind === "pay_out").map((move) => move.id);
  if (ids.length === 0) return new Map();
  return listMovementLinks(liveExpenseDb, tenantId, ids).catch(() => null);
}

function ShiftCardContent({ orders, payments, pageLimit, ledgerReady, ledgerError, isPayOutRequested, onPayOutHandled }: ContentProps) {
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
  // Counted, not yet ended: the close sheet (design screen 07) shows this.
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  // "Pay an expense" / "Take out cash" from my own drawer (plan §4.1).
  const [expenseScope, setExpenseScope] = useState<ExpenseSheetScope | null>(null);
  // The register asked to pay out with no shift open: say so on the clock-in card.
  const [payOutHint, setPayOutHint] = useState<string | null>(null);
  // What this person did to web orders during the shift. Read separately
  // from the drawer and never added to it: a confirmed web order is the
  // store's money, not this drawer's (shift-drawer.ts).
  const [activity, setActivity] = useState<OrderActivityEvent[] | null>(null);

  const myShift = floor.myShift;
  const drawerExpenses = useDrawerExpenses(myShift?.id ?? null, floor.moves ?? []);
  const categoriesRead = useExpenseCategories();
  const { categories } = categoriesRead;
  // Settled = read or failed; a store without categories never becomes "ready".
  const haveCategoriesSettled = categoriesRead.data !== undefined || categoriesRead.error !== null;
  const categoryIndex = useCategoryIndex(categories);
  const canOpenExpenses = useCanManageExpenses();
  // Managers: every open drawer's pay-outs told apart, in one bounded read.
  const floorLinks = usePayoutLinks(floor.moves, canManage);

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
      floor.openShifts.map((shift) => {
        const expectation = expectDrawer(shift, sources);
        const shiftMoves = (floor.moves ?? []).filter((move) => move.shiftId === shift.id);
        const collected = expectation.state === "ready" ? expectation.value.moves.collected : 0;
        return {
          shift,
          expectation,
          isMine: shift.id === myShift?.id,
          payoutSplit: drawerSplitText(floorLinks ? summarizeShiftPayouts(shiftMoves, floorLinks) : null, collected),
        };
      }),
    [floor.openShifts, floor.moves, floorLinks, sources, myShift],
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

  const finishClose = async (review: CloseReview) => {
    setPendingClose(null);
    setActivity(null);
    await floor.reload();
    void drawerExpenses.reloadPayouts();
    const done = closedConfirmation(review);
    Alert.alert(done.title, done.message);
  };

  /**
   * Settle this phone's drawer expenses, re-read the drawer's moves and build
   * the close sheet from them — at the count AND again at "End shift", so a
   * pickup or pay-in recorded on another tablet meanwhile is never missed.
   */
  const prepareClose = async (shift: ShiftRecord, counted: number): Promise<PreparedClose> => {
    if (!tenantId) return { kind: "blocked", reason: "Try again." };
    // Cash this phone paid out must be on the server before the count is
    // judged, or the drawer reads over by exactly that much. Fails CLOSED: a
    // phone that cannot tell what it still holds does not close.
    let refused = 0;
    if (shift.id === myShift?.id) {
      try {
        const settled = await drawerExpenses.settleBeforeClose(shift.id);
        if (settled.waiting > 0) return { kind: "blocked", reason: waitingToSyncText(settled.waiting) };
        refused = settled.refused;
      } catch (error) {
        console.warn("[shift] could not settle this phone's drawer pay-outs", error);
        return { kind: "blocked", reason: SETTLE_FAILED_TEXT };
      }
    }
    // Re-read this drawer's moves first: a pickup recorded on another
    // tablet since this screen loaded would otherwise read as a shortage.
    let fresh: DrawerExpectationRead;
    let freshMoves: Awaited<ReturnType<typeof listCashMoves>>;
    try {
      freshMoves = await listCashMoves(tenantId, [shift.id]);
      fresh = expectDrawer(shift, { ...sources, moves: freshMoves, nowMs: Date.now() });
    } catch (error) {
      return { kind: "blocked", reason: errorText(error) };
    }
    if (fresh.state !== "ready") {
      return { kind: "blocked", reason: fresh.state === "unavailable" ? fresh.reason : "Settlement history is still loading. Try again in a moment." };
    }
    const rec = fresh.value.reconciliation;
    const final: ShiftReconciliation = { ...rec, ...judgeCount(rec.expectedInDrawer, rec.floatToKeep, counted) };
    const review = closeReview({
      shift,
      isMine: shift.id === myShift?.id,
      cashSales: fresh.value.summary.cashTotal,
      moves: freshMoves,
      links: await readLinks(tenantId, freshMoves),
      reconciliation: final,
      counted,
    });
    return { kind: "ready", pending: { shift, expectedInDrawer: rec.expectedInDrawer, counted, review, notice: null }, refused };
  };

  const handleCount = (counted: number) =>
    runExclusive(async () => {
      if (refuseInDemo() || !tenantId || !countTarget) return;
      const prepared = await prepareClose(countTarget.shift, counted);
      if (prepared.kind === "blocked") {
        alertNotReady(prepared.reason, () => void handleCount(counted));
        return;
      }
      setCountTarget(null);
      setPendingClose(prepared.pending);
    });

  const handleEndShift = () =>
    runExclusive(async () => {
      if (refuseInDemo() || !tenantId || !pendingClose) return;
      // The sheet may have sat open while another tablet moved cash: read the
      // drawer again rather than write the figure frozen at the count.
      const prepared = await prepareClose(pendingClose.shift, pendingClose.counted);
      if (prepared.kind === "blocked") {
        alertNotReady(prepared.reason, () => void handleEndShift());
        return;
      }
      // A pay-out the store did not take is cash that left without a record:
      // the cashier sends it again or removes it on this sheet first.
      if (prepared.refused > 0) {
        setPendingClose({ ...prepared.pending, notice: REFUSED_BLOCKS_CLOSE });
        return;
      }
      if (hasDrawerChanged(pendingClose.expectedInDrawer, prepared.pending.expectedInDrawer)) {
        setPendingClose({ ...prepared.pending, notice: DRAWER_CHANGED_NOTICE });
        return;
      }
      const { shift, expectedInDrawer, counted, review } = prepared.pending;
      try {
        await closeShift(tenantId, shift.id, {
          closingCount: counted,
          // Read just now and unchanged since the sheet showed it; see shift-service.ts.
          expectedCash: expectedInDrawer,
          note: null,
          closedByName: await readStaffName(),
        });
        await finishClose(review);
      } catch (error) {
        // A timed-out close may still have landed. Only a successful read that
        // no longer finds THIS shift open counts as closed — a failed read is
        // not evidence either way.
        const hasLanded = await isShiftStillOpen(tenantId, shift.id)
          .then((open) => !open)
          .catch(() => false);
        if (hasLanded) {
          await finishClose(review);
          return;
        }
        Alert.alert("Could not end the shift", errorText(error));
      }
    });

  const openExpenseSheet = (scope: ExpenseSheetScope) => {
    if (refuseInDemo()) return;
    setMoveTarget(null);
    setExpenseScope(scope);
  };

  // The register's "Pay out": open "Pay from the drawer" once the drawer is known.
  // The parent may hand a new callback every render: read it from a ref so the
  // request is acted on once, not again on each render before it is cleared.
  const onPayOutHandledRef = useRef(onPayOutHandled);
  useEffect(() => {
    onPayOutHandledRef.current = onPayOutHandled;
  }, [onPayOutHandled]);
  const hasHandledPayOut = useRef(false);
  useEffect(() => {
    if (!isPayOutRequested) {
      hasHandledPayOut.current = false;
      return;
    }
    if (hasHandledPayOut.current || !floor.isLoaded) return;
    // Wait only while the categories are still loading; once they failed (or
    // the store has none) the request is cleared, never left to pop later.
    if (myShift && !drawerExpenses.isReady && !haveCategoriesSettled) return;
    hasHandledPayOut.current = true;
    if (!myShift) {
      setPayOutHint(PAY_OUT_NEEDS_SHIFT);
    } else if (drawerExpenses.isReady && !useAuthStore.getState().isDemo) {
      setMoveTarget(null);
      setExpenseScope("spend");
    }
    onPayOutHandledRef.current?.();
  }, [isPayOutRequested, floor.isLoaded, myShift, drawerExpenses.isReady, haveCategoriesSettled]);

  const myPending = myShift ? drawerExpenses.pendingFor(myShift.id) : { cents: 0, count: 0, waiting: 0 };
  // Refused pay-outs are not "waiting": they are shown on their own, with Try again / Remove.
  const myRefused = myShift ? drawerExpenses.refusedFor(myShift.id) : [];
  const pendingLine =
    myPending.count > 0
      ? `${myPending.count} ${myPending.count === 1 ? "expense" : "expenses"} waiting to sync · −${formatCentsPeso(myPending.cents)} already out of the drawer`
      : null;
  const myReady = myExpectation?.state === "ready" ? myExpectation.value.reconciliation : null;
  // What the drawer should hold now, less what this phone paid out and has not synced yet.
  const availableCents = myReady ? Math.round(myReady.expectedInDrawer * 100) - myPending.cents : null;

  if (!floor.isLoaded) return null;

  const notice = floor.needsBranch
    ? "Choose a branch above to see its drawers."
    : floor.error && floor.drawers.length === 0
      ? `Drawers could not be loaded: ${floor.error}`
      : null;

  const isOwnMoveTarget = moveTarget !== null && moveTarget.shiftId === myShift?.id;
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
          onCashMove={() =>
            openMoveSheet(
              myShift,
              myExpectation,
              // With expenses, a pay out is always an expense or cash taken out,
              // each in its own sheet; the free-text one stays for a store
              // whose database has no expenses yet.
              drawerExpenses.isReady ? ["pay_in", "collect"] : ["pay_out", "pay_in", "collect"],
            )
          }
          onEndShift={() => openCountSheet(myShift, myExpectation)}
          onPayExpense={drawerExpenses.isReady ? () => openExpenseSheet("spend") : undefined}
          payoutLines={drawerExpenses.payouts ? payoutLines(drawerExpenses.payouts) : null}
          pendingLine={pendingLine}
          refusedPayouts={myRefused}
          onRetryRefused={drawerExpenses.retryRefused}
          onRemoveRefused={drawerExpenses.removeRefused}
        />
      ) : (
        <ClockInCard
          board={board}
          isBusy={busy}
          canManage={canManage}
          notice={notice}
          hint={payOutHint}
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
          onTakeOut={isOwnMoveTarget && drawerExpenses.isReady ? () => openExpenseSheet("take_out") : undefined}
        />
      ) : null}
      {expenseScope && myShift ? (
        <AddExpenseSheet
          visible
          scope={expenseScope}
          mode={{
            kind: "drawer",
            shiftId: myShift.id,
            drawerName: myShift.drawerName ?? "My",
            availableCents,
          }}
          onClose={() => setExpenseScope(null)}
          onCommitted={() => {
            void floor.reload();
            void drawerExpenses.reloadPayouts();
          }}
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
      {pendingClose ? (
        <CloseShiftSheet
          key={pendingClose.shift.id}
          review={pendingClose.review}
          notice={pendingClose.notice}
          categories={categoryIndex}
          isBusy={busy}
          onEnd={() => void handleEndShift()}
          onClose={() => setPendingClose(null)}
          refusedPayouts={pendingClose.shift.id === myShift?.id ? myRefused : undefined}
          onRetryRefused={drawerExpenses.retryRefused}
          onRemoveRefused={drawerExpenses.removeRefused}
          onOpenExpenses={
            canOpenExpenses
              ? () => {
                  setPendingClose(null);
                  router.push(DRAWER_EXPENSES_ROUTE as never);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
