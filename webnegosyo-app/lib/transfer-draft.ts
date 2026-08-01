/**
 * Composing a transfer, as the phone has to judge it.
 *
 * The receiving half of transfers already lives on this app because counting a
 * delivery in happens standing up with a box open. Composing one was left to
 * the web admin on the theory that it is desk work — but the person who knows
 * a shop is about to run out is the person standing in it, and the shop with
 * spare stock is often the one nobody is sitting at a desk in.
 *
 * **Every question here is asked of the SOURCE BRANCH's shelf.** The roll-up on
 * `inventory_items.current_qty` is the number that would happily offer a
 * chain's 700 g of flour as sendable from a shop holding 40 of it. The screen
 * re-reads stock for whichever branch is chosen as the source rather than
 * reusing the shelf already on display, because that shelf is the roll-up
 * whenever an owner is looking at the whole store.
 *
 * **Nothing here is a security boundary.** A merchant who gets past all of it
 * still meets `canSendTransfer` in `stock-transfers-service.ts`, re-resolved
 * against `app_users` with their own token, and then `apply_stock_movement()`,
 * which is what actually protects the stock. This only stops somebody drafting
 * a transfer they were always going to be refused, at the start of the job
 * rather than the end of it.
 *
 * Deliberately a port of `src/lib/inventory/transfer-availability.ts` and
 * `stock-transfer.ts` rather than a shared import: `src/` and the Expo app have
 * no shared module graph, and a package for six pure functions would cost more
 * than the duplication. What must NOT drift is the WORDING — the refusals below
 * are the server's own sentences, and a merchant reading both surfaces about
 * one box must not be told two different things.
 */

import type { BranchScope } from "./branch-scope";
import type { StockItemView } from "./inventory-stock";

/**
 * Quantities are NUMERIC(16,4), so anything under a ten-thousandth is
 * round-trip dust. Treating it as stock would offer an exhausted ingredient;
 * treating it as an over-draft would refuse a legitimate "send it all".
 */
const QUANTITY_EPSILON = 1e-4;

/** An ingredient the source branch could actually put on a van. */
export interface SendableIngredient {
  id: string;
  name: string;
  /** Empty when the ingredient has no meaningful unit to show. */
  unitAbbreviation: string;
  /** What the SOURCE BRANCH holds, in the ingredient's stock unit. */
  onHand: number;
}

/** A drafted line, before it is a transfer. */
export interface DraftedQuantity {
  inventoryItemId: string;
  quantity: number;
}

/** A transfer as somebody composes it, in the shape the route takes. */
export interface ComposedDraft {
  /** `null` is the unbranched store pool — a real shelf, not an absent branch. */
  fromOutletId: string | null;
  toOutletId: string | null;
  lines: readonly DraftedQuantity[];
}

/**
 * The ingredients this branch could send, with what it holds of each.
 *
 * Takes the branch's own shelf (`loadInventoryStock(tenantId, sourceOutletId)`)
 * rather than a stock index, because the app already has that loader and a
 * second read shape would be a second thing to keep true.
 *
 * Anything the branch holds none of is DROPPED rather than listed at zero. That
 * is deliberately the opposite of `applyBranchStock`, which keeps a zero
 * ingredient in the shelf so a manager can receive their first delivery of it:
 * a shelf with nothing on it is a thing you can put stock ON, and not a thing
 * you can take stock OFF. Negative on-hand goes the same way — it means a sale
 * was recorded before its delivery, and there is still nothing to load.
 *
 * Sorted by name, NOT worst-first like the shelf. The shelf sorts trouble to
 * the top because trouble is what it is for; a send picker is used by somebody
 * looking for what they have plenty of, and an order derived from scarcity is
 * the one order that buries it.
 */
export function ingredientsAvailableAt(
  shelf: readonly StockItemView[],
): SendableIngredient[] {
  return shelf
    .filter((item) => item.quantity > QUANTITY_EPSILON)
    .map((item) => ({
      id: item.id,
      name: item.name,
      unitAbbreviation: item.unitAbbreviation,
      onHand: item.quantity,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** What the source branch holds of one ingredient. Absent means zero. */
function onHandOf(shelf: readonly StockItemView[], inventoryItemId: string): number {
  return shelf.find((item) => item.id === inventoryItemId)?.quantity ?? 0;
}

/**
 * The drafted lines asking for more than the source branch holds.
 *
 * Returns ids rather than a boolean so the sheet can point at the line that is
 * wrong. "Something in this transfer is too big" makes the merchant re-check
 * every row they typed.
 *
 * An ingredient absent from the shelf counts as over-drafted at any quantity:
 * no row means ZERO, never the roll-up.
 */
export function overDraftedItemIds(
  lines: readonly DraftedQuantity[],
  shelf: readonly StockItemView[],
): string[] {
  return lines
    .filter((line) => line.quantity - onHandOf(shelf, line.inventoryItemId) > QUANTITY_EPSILON)
    .map((line) => line.inventoryItemId);
}

/**
 * May this account send stock out of that branch?
 *
 * Mirrors `canSendTransfer`. A branch account is confined to its own branch and
 * is refused the store pool outright — a branch may send only its own stock,
 * and the pool belongs to the store.
 *
 * A courtesy, not a boundary: the service re-checks against `app_users`.
 */
export function canSendFrom(scope: BranchScope, fromOutletId: string | null): boolean {
  if (scope.kind === "all") return true;
  return fromOutletId !== null && fromOutletId === scope.outletId;
}

/**
 * A quantity as typed into a phone, or `null` if it is not one.
 *
 * `null` rather than zero for everything unusable. Coercing a blank box to zero
 * would write a ledger leg that moves nothing while claiming a transfer
 * happened — and on the receiving side zero has a meaning of its own (a load
 * that never turned up), so the two must never be confusable.
 */
export function parseTransferQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

/**
 * What is wrong with this draft, in the server's own words, or `null`.
 *
 * Mirrors `validateTransferDraft`. Checked here so the merchant is told before
 * they tap rather than after a round trip — but the sentences are copied, not
 * invented, so a refusal that slips past this and is caught by the server reads
 * identically.
 *
 * Over-drafting is deliberately NOT one of these: it depends on a shelf read
 * that this function has no business holding, and `overDraftedItemIds` answers
 * it per line so the screen can mark the row instead of describing it.
 */
export function describeDraftProblem(draft: ComposedDraft): string | null {
  if (draft.fromOutletId === draft.toOutletId) {
    return "A transfer cannot be sent to the same branch it came from";
  }

  if (draft.lines.length === 0) {
    return "A transfer needs at least one ingredient";
  }

  const seen = new Set<string>();
  for (const line of draft.lines) {
    if (!(line.quantity > 0)) {
      return "Every line needs a quantity greater than zero";
    }
    if (seen.has(line.inventoryItemId)) {
      return "Each ingredient can appear on a transfer only once";
    }
    seen.add(line.inventoryItemId);
  }

  return null;
}
