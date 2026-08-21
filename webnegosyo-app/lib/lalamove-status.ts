/**
 * The app's Lalamove status vocabulary.
 *
 * Hand-synced mirror of the web's src/lib/lalamove-status.ts — React Native
 * cannot import from src/. If the FINAL set changes there, change it here too.
 *
 * Lalamove v3 reports: ASSIGNING_DRIVER, ON_GOING, PICKED_UP, COMPLETED,
 * CANCELED, REJECTED, EXPIRED. Older writers in this codebase also produced
 * ASSIGNING, ASSIGNED, IN_TRANSIT, DELIVERED, CANCELLED — both generations are
 * recognized, case-insensitively.
 */

/** Statuses after which a delivery is over, one way or another. */
export const LALAMOVE_FINAL_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETED",
  "DELIVERED",
  "CANCELED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
]);

export function isLalamoveFinal(status: string | null | undefined): boolean {
  if (!status) return false;
  return LALAMOVE_FINAL_STATUSES.has(status.toUpperCase());
}

/**
 * A booked delivery that has not finished — the predicate that drives
 * auto-sync. Finished (or unbooked) deliveries are not worth polling.
 */
export function isActiveLalamoveDelivery(status: string | null | undefined): boolean {
  if (!status) return false;
  return !isLalamoveFinal(status);
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNING_DRIVER: "Finding a driver",
  ASSIGNING: "Finding a driver",
  ON_GOING: "Driver assigned",
  ASSIGNED: "Driver assigned",
  PICKED_UP: "On the way",
  IN_TRANSIT: "On the way",
  COMPLETED: "Delivered",
  DELIVERED: "Delivered",
  CANCELED: "Cancelled",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

/** Words a merchant can read instead of the raw API status. */
export function lalamoveStatusLabel(status: string | null | undefined): string {
  if (!status) return "Booked";
  return STATUS_LABELS[status.toUpperCase()] ?? status;
}

export type LalamoveBadgeVariant =
  | "pending"
  | "confirmed"
  | "delivered"
  | "cancelled"
  | "default";

const STATUS_BADGES: Record<string, LalamoveBadgeVariant> = {
  ASSIGNING_DRIVER: "pending",
  ASSIGNING: "pending",
  ON_GOING: "confirmed",
  ASSIGNED: "confirmed",
  PICKED_UP: "confirmed",
  IN_TRANSIT: "confirmed",
  COMPLETED: "delivered",
  DELIVERED: "delivered",
  CANCELED: "cancelled",
  CANCELLED: "cancelled",
  REJECTED: "cancelled",
  EXPIRED: "cancelled",
};

/** The existing Badge variant that matches a delivery phase. */
export function lalamoveBadgeVariant(status: string | null | undefined): LalamoveBadgeVariant {
  if (!status) return "default";
  return STATUS_BADGES[status.toUpperCase()] ?? "default";
}
