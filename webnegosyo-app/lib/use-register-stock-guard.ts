/**
 * The register's stock question, as a hook: when a dish is added and again at
 * Charge, judge the sale against the stock count (`pos-stock-warning.ts`),
 * decide what to ask (`pos-stock-decision.ts`), and hold the question for
 * `StockShortSheet` until the cashier answers.
 *
 * No ceilings (offline, a failed read, inventory off) means no question — the
 * till never waits on a guess. A dish the cashier already chose to "Sell
 * anyway" is not asked about again on the next tap in the same sale (Charge
 * still asks, once, over the whole sale).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PosCartLine } from "./pos-cart";
import {
  findAddedShortfall,
  findStockShortfalls,
  type PosStockCeilings,
  type StockDemandLine,
} from "./pos-stock-warning";
import {
  clampLinesToStock,
  decideAddStock,
  decideChargeStock,
  type LineQuantityChange,
  type StockDecisionContext,
  type StockQuestion,
} from "./pos-stock-decision";

interface PendingQuestion {
  question: StockQuestion;
  sellWithin: () => void;
  sellAnyway: () => void;
}

export interface RegisterStockGuardInput {
  lines: readonly PosCartLine[];
  /** What this sale asks of the shelf (`saleStockDemand`, edit-aware). */
  demand: readonly StockDemandLine[];
  ceilings: PosStockCeilings;
  context: StockDecisionContext;
  /** False for a revised placed order, whose demand is a difference. */
  canClamp: boolean;
}

export interface GuardAddOptions {
  /**
   * Wait this long before showing the question — set when another modal (the
   * option picker) is closing, so iOS is not asked to present over it.
   */
  presentAfterMs?: number;
}

export interface StockSheetBindings {
  question: StockQuestion | null;
  onSellWithin: () => void;
  onSellAnyway: () => void;
  onCancel: () => void;
}

export interface RegisterStockGuard {
  /** Add `added`, or ask first. `commit(units)` adds that many. */
  guardAdd: (added: StockDemandLine, commit: (units: number) => void, options?: GuardAddOptions) => void;
  /** Go on to tender, or ask first. `applyChanges` cuts the cart for "Sell N". */
  guardCharge: (proceed: () => void, applyChanges: (changes: LineQuantityChange[]) => void) => void;
  sheet: StockSheetBindings;
}

export function useRegisterStockGuard(input: RegisterStockGuardInput): RegisterStockGuard {
  const { lines, demand, ceilings, context, canClamp } = input;
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const acknowledgedRef = useRef<ReadonlySet<string>>(new Set());
  const presentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new sale starts with nothing acknowledged.
  useEffect(() => {
    if (lines.length === 0) acknowledgedRef.current = new Set();
  }, [lines.length]);

  useEffect(
    () => () => {
      if (presentTimerRef.current) clearTimeout(presentTimerRef.current);
    },
    [],
  );

  const present = useCallback((next: PendingQuestion, delayMs: number) => {
    if (presentTimerRef.current) clearTimeout(presentTimerRef.current);
    if (delayMs <= 0) {
      setPending(next);
      return;
    }
    presentTimerRef.current = setTimeout(() => {
      presentTimerRef.current = null;
      setPending(next);
    }, delayMs);
  }, []);

  const guardAdd = useCallback<RegisterStockGuard["guardAdd"]>(
    (added, commit, options = {}) => {
      const shortfall = acknowledgedRef.current.has(added.menuItemId)
        ? null
        : findAddedShortfall(demand, added, ceilings);
      const decision = decideAddStock({ shortfall, addedQuantity: added.quantity }, context);
      if (decision.kind === "proceed") {
        commit(added.quantity);
        return;
      }

      const { question } = decision;
      present(
        {
          question,
          sellWithin: () => {
            if (question.sellWithin?.units) commit(question.sellWithin.units);
          },
          sellAnyway: () => {
            acknowledgedRef.current = new Set([...acknowledgedRef.current, added.menuItemId]);
            commit(added.quantity);
          },
        },
        options.presentAfterMs ?? 0,
      );
    },
    [demand, ceilings, context, present],
  );

  const guardCharge = useCallback<RegisterStockGuard["guardCharge"]>(
    (proceed, applyChanges) => {
      const shortfalls = findStockShortfalls(demand, ceilings);
      const decision = decideChargeStock({ shortfalls, canClamp }, context);
      if (decision.kind === "proceed") {
        proceed();
        return;
      }
      present(
        {
          question: decision.question,
          sellWithin: () => {
            applyChanges(clampLinesToStock(lines, shortfalls));
            proceed();
          },
          sellAnyway: proceed,
        },
        0,
      );
    },
    [demand, ceilings, canClamp, context, lines, present],
  );

  const close = useCallback(() => setPending(null), []);

  const sheet: StockSheetBindings = {
    question: pending?.question ?? null,
    onSellWithin: () => {
      if (!pending?.question.sellWithin) return;
      close();
      pending.sellWithin();
    },
    onSellAnyway: () => {
      if (!pending || pending.question.sellAnyway.mode !== "proceed") return;
      close();
      pending.sellAnyway();
    },
    onCancel: close,
  };

  return { guardAdd, guardCharge, sheet };
}
