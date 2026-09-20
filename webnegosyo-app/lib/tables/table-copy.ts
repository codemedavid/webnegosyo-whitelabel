/**
 * The words the floor uses for a table's state — pills, legend, the header
 * line and the label a screen reader speaks for a node.
 */

import { formatSeatedFor } from "./table-actions";
import type { FloorSummary, TableStatus, TableView } from "./table-floor";

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: "Available",
  seated: "Seated",
  ordered: "Ordered",
  ready: "Ready",
  billing: "Billing",
};

export function tableStatusLabel(status: TableStatus): string {
  return TABLE_STATUS_LABELS[status];
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "Table 4, ready, 3 guests, seated 42m, 1 order" */
export function describeTable(view: TableView): string {
  const parts = [`Table ${view.table.label}`, tableStatusLabel(view.status).toLowerCase()];
  if (view.seating) {
    parts.push(plural(view.covers, "guest"));
    parts.push(`seated ${formatSeatedFor(view.seatedForMs ?? 0)}`);
  } else {
    parts.push(`seats ${view.table.seats}`);
  }
  if (view.orders.length > 0) parts.push(plural(view.orders.length, "order"));
  return parts.join(", ");
}

/** "4 seated · 11 guests · 2 free" */
export function floorSubtitle(summary: FloorSummary): string {
  if (summary.total === 0) return "No tables yet";
  const occupied = summary.total - summary.byStatus.available;
  return `${occupied} seated · ${summary.covers} guests · ${summary.byStatus.available} free`;
}

/** What an empty table says about itself: "4 seats", and never "1 seats". */
export function seatsLabel(seats: number): string {
  return `${seats} ${seats === 1 ? "seat" : "seats"}`;
}
