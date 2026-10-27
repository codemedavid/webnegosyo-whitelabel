/**
 * Who can receive a cashier's cash: the owner and every `cash_manage` holder
 * who can reach the branch (CONTRACTS W2.4). Shared by End shift & remit
 * ("Who is receiving it?", app-cashier), pickups ("Taken by") and the rules
 * screen.
 *
 * Read through the definer RPC `list_cash_receivers(p_tenant, p_outlet)`: a
 * cashier cannot read the staff roster, and must not, so the server hands
 * back only names, roles and presence. Assumed row shape (camelCase, snake
 * accepted): `{ userId, name, isOwner, outletId, isOnShift, lastSeenAt }`.
 */

import { withDeadline } from "../offline/deadline";
import { describeCashError, isNotDeployed, type CashDb } from "./settings";

const REQUEST_MS = 15_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface CashReceiver {
  userId: string;
  name: string;
  isOwner: boolean;
  /** null = the whole store. */
  outletId: string | null;
  /** Clocked in on a shift right now. */
  isOnShift: boolean;
  lastSeenAt: string | null;
}

export const RECEIVERS_COPY = {
  notReady: "Remittances need a server update first. Ask WebNegosyo support.",
  none: "Nobody here can receive cash yet. The owner can give someone Cash & day close in Team.",
} as const;

const pick = (row: Record<string, unknown>, camel: string, snake: string): unknown =>
  camel in row ? row[camel] : row[snake];

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function parseReceivers(raw: unknown): CashReceiver[] {
  if (!Array.isArray(raw)) throw new Error("The list of who can receive cash could not be read.");
  return raw.flatMap((item): CashReceiver[] => {
    if (item === null || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const userId = text(pick(row, "userId", "user_id"));
    if (!userId) return [];
    return [
      {
        userId,
        name: text(row.name) ?? "Staff",
        isOwner: pick(row, "isOwner", "is_owner") === true,
        outletId: text(pick(row, "outletId", "outlet_id")),
        isOnShift: pick(row, "isOnShift", "is_on_shift") === true,
        lastSeenAt: text(pick(row, "lastSeenAt", "last_seen_at")),
      },
    ];
  });
}

/**
 * The "Remit to" list for `cashierUserId`: people on shift first, then the
 * owner, then by name. The cashier never hands cash to themselves — except
 * the owner, whose own shift is "received by themselves" (07 §5.1).
 */
export function receiversForRemit(receivers: readonly CashReceiver[], cashierUserId: string | null): CashReceiver[] {
  return receivers
    .filter((receiver) => receiver.userId !== cashierUserId || receiver.isOwner)
    .sort(
      (a, b) =>
        Number(b.isOnShift) - Number(a.isOnShift) ||
        Number(b.isOwner) - Number(a.isOwner) ||
        a.name.localeCompare(b.name),
    );
}

/** "On shift now" · "Last seen 2h ago" · "" when nothing is known. */
export function describePresence(receiver: CashReceiver, nowMs: number): string {
  if (receiver.isOnShift) return "On shift now";
  if (!receiver.lastSeenAt) return "";
  const ago = Math.max(0, nowMs - Date.parse(receiver.lastSeenAt));
  if (!Number.isFinite(ago)) return "";
  if (ago < HOUR_MS) return `Last seen ${Math.max(1, Math.round(ago / MINUTE_MS))}m ago`;
  if (ago < DAY_MS) return `Last seen ${Math.round(ago / HOUR_MS)}h ago`;
  return `Last seen ${Math.round(ago / DAY_MS)}d ago`;
}

/** THROWS: an empty answer means "nobody can receive", so a failed read must not look like one. */
export async function listCashReceivers(db: CashDb, tenantId: string, outletId: string | null): Promise<CashReceiver[]> {
  const { data, error } = await withDeadline(
    Promise.resolve(db.rpc("list_cash_receivers", { p_tenant: tenantId, p_outlet: outletId })),
    REQUEST_MS,
  );
  if (error) {
    if (isNotDeployed(error)) throw new Error(RECEIVERS_COPY.notReady);
    throw describeCashError(error, "The list of who can receive cash could not be read.");
  }
  return parseReceivers(data ?? []);
}
