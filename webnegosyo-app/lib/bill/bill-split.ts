/**
 * Splitting a bill between guests: evenly, or by who had what.
 *
 * By item works on UNITS, one per piece ("3x Latte" is three units), because a
 * table shares a round of drinks by the glass. Each unit carries its own slice
 * of its order's service charge, delivery fee and discount, priced up front so
 * that a guest's share never depends on how the rest of the table splits.
 * Every slice is allocated in whole centavos, so an order's units always add
 * back to exactly that order's total.
 */
import { readOrderDiscount } from "../order-discount";
import { allocateCents, toCents } from "./money";
import { sortBillOrders, type BillItem, type BillOrder } from "./bill-orders";

export interface UnitDiscountLine {
  label: string;
  cents: number;
}

export interface BillUnit {
  /** Stable across renders: `<orderId>:<line>:<piece>`. */
  id: string;
  orderId: string;
  /** The line this piece came from, as one piece (quantity 1). */
  item: BillItem;
  itemCents: number;
  deliveryCents: number;
  serviceCents: number;
  discountLines: UnitDiscountLine[];
  /** What this piece costs the guest who takes it. */
  totalCents: number;
}

export interface ItemPart {
  guest: number;
  units: BillUnit[];
  totalCents: number;
  /** How much of this share settles each order. */
  byOrder: Record<string, number>;
}

/** Placeholder line for an order that charges something but lists no items. */
const CHARGES_ONLY_NAME = "Other charges";

const DEFAULT_DISCOUNT_LABEL = "Discount";

export function evenShareCents(amountCents: number, guests: number): number[] {
  if (!Number.isInteger(guests) || guests < 1) return [];
  return allocateCents(amountCents, Array.from({ length: guests }, () => 1));
}

export function orderDiscountLines(order: BillOrder): UnitDiscountLine[] {
  const discount = readOrderDiscount(order);
  if (!discount || discount.total <= 0) return [];
  const lines = discount.lines
    .filter((line) => Number.isFinite(line.amount) && line.amount > 0)
    .map((line) => ({ label: line.label || DEFAULT_DISCOUNT_LABEL, cents: toCents(line.amount) }));
  return lines.length > 0 ? lines : [{ label: DEFAULT_DISCOUNT_LABEL, cents: toCents(discount.total) }];
}

interface Piece {
  item: BillItem;
  lineIndex: number;
  piece: number;
  cents: number;
}

function piecesOf(order: BillOrder): Piece[] {
  if (order.items.length === 0) {
    const item = { orderId: order._id, menuItemName: CHARGES_ONLY_NAME, quantity: 1, subtotal: 0 };
    return [{ item, lineIndex: 0, piece: 0, cents: 0 }];
  }
  return order.items.flatMap((line, lineIndex) => {
    const quantity = Math.max(1, Math.floor(line.quantity));
    const shares = allocateCents(toCents(line.subtotal), Array.from({ length: quantity }, () => 1));
    return shares.map((cents, piece) => ({
      item: { ...line, quantity: 1, subtotal: cents / 100 },
      lineIndex,
      piece,
      cents,
    }));
  });
}

/**
 * A Senior/PWD discount belongs to the claimant's own dishes, so on a split
 * bill it rides on THOSE pieces — whoever takes the senior's plate takes the
 * senior's discount — instead of being spread over the whole table. Read from
 * the order's per-line allocations (`line-<index>`); any part not tied to a
 * line (VAT taken off a service-charge share) is spread like every other
 * charge. Null for an order without a Senior/PWD discount.
 */
function governmentPieceCents(order: BillOrder, pieces: readonly Piece[]): number[] | null {
  const discount = readOrderDiscount(order);
  if (!discount?.government || discount.total <= 0) return null;

  const perPiece = pieces.map(() => 0);
  const byLine = new Map<number, number[]>();
  pieces.forEach((piece, index) => byLine.set(piece.lineIndex, [...(byLine.get(piece.lineIndex) ?? []), index]));
  for (const [lineIndex, indexes] of byLine) {
    const allocated = toCents(discount.allocationsByLine[`line-${lineIndex}`] ?? 0);
    const shares = allocateCents(allocated, indexes.map((index) => pieces[index].cents));
    indexes.forEach((index, position) => {
      perPiece[index] = shares[position];
    });
  }

  const unallocated = toCents(discount.total) - perPiece.reduce((sum, cents) => sum + cents, 0);
  if (unallocated > 0) {
    const spread = allocateCents(unallocated, pieces.map((piece) => piece.cents));
    spread.forEach((cents, index) => {
      perPiece[index] += cents;
    });
  }
  return perPiece;
}

const GOVERNMENT_LABEL = "Senior/PWD discount";

function unitsOfOrder(order: BillOrder): BillUnit[] {
  const pieces = piecesOf(order);
  const weights = pieces.map((piece) => piece.cents);
  const government = governmentPieceCents(order, pieces);
  if (government) return governmentUnits(order, pieces, government);
  const totals = allocateCents(toCents(order.total), weights);
  const delivery = allocateCents(toCents(order.deliveryFee ?? 0), weights);
  const service = allocateCents(toCents(order.serviceCharge ?? 0), weights);
  const discounts = orderDiscountLines(order).map((line) => ({
    label: line.label,
    shares: allocateCents(line.cents, weights),
  }));

  return pieces.map((piece, index) => ({
    id: `${order._id}:${piece.lineIndex}:${piece.piece}`,
    orderId: order._id,
    item: piece.item,
    itemCents: piece.cents,
    deliveryCents: delivery[index],
    serviceCents: service[index],
    discountLines: discounts
      .map((line) => ({ label: line.label, cents: line.shares[index] }))
      .filter((line) => line.cents > 0),
    totalCents: totals[index],
  }));
}

function governmentUnits(order: BillOrder, pieces: readonly Piece[], government: readonly number[]): BillUnit[] {
  const weights = pieces.map((piece) => piece.cents);
  const discountCents = government.reduce((sum, cents) => sum + cents, 0);
  // The bill before the discount, spread like any charge; each piece then
  // gives back exactly its own Senior/PWD share — so the parts still add up
  // to the order's total, to the centavo.
  const gross = allocateCents(toCents(order.total) + discountCents, weights);
  const delivery = allocateCents(toCents(order.deliveryFee ?? 0), weights);
  const service = allocateCents(toCents(order.serviceCharge ?? 0), weights);

  return pieces.map((piece, index) => ({
    id: `${order._id}:${piece.lineIndex}:${piece.piece}`,
    orderId: order._id,
    item: piece.item,
    itemCents: piece.cents,
    deliveryCents: delivery[index],
    serviceCents: service[index],
    discountLines: government[index] > 0 ? [{ label: GOVERNMENT_LABEL, cents: government[index] }] : [],
    totalCents: gross[index] - government[index],
  }));
}

/** Every piece on the bill, oldest order first. */
export function billUnits(orders: readonly BillOrder[]): BillUnit[] {
  return sortBillOrders(orders).flatMap(unitsOfOrder);
}

/**
 * Each guest's share. `assignment` maps a unit id to a guest index (0-based);
 * units with no guest, or a guest past `guests`, are unassigned.
 */
export function itemParts(
  units: readonly BillUnit[],
  assignment: Readonly<Record<string, number>>,
  guests: number,
): { parts: ItemPart[]; unassigned: BillUnit[] } {
  const count = Math.max(0, Math.floor(guests));
  const parts: ItemPart[] = Array.from({ length: count }, (_, guest) => ({
    guest,
    units: [],
    totalCents: 0,
    byOrder: {},
  }));
  const unassigned: BillUnit[] = [];

  for (const unit of units) {
    const guest = assignment[unit.id];
    const part = guest === undefined ? undefined : parts[guest];
    if (!part) {
      unassigned.push(unit);
      continue;
    }
    parts[part.guest] = {
      ...part,
      units: [...part.units, unit],
      totalCents: part.totalCents + unit.totalCents,
      byOrder: { ...part.byOrder, [unit.orderId]: (part.byOrder[unit.orderId] ?? 0) + unit.totalCents },
    };
  }
  return { parts, unassigned };
}
