/**
 * Export (`app/(main)/export.tsx`): a utility screen (`href: null` in
 * app/(main)/_layout.tsx) opened from Reports. Never a tab, so no account's
 * bar or hub changes shape.
 */

import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";

export const EXPORT_ROUTE = "/(main)/export" as const;

export interface ExportDoorInput {
  caller: StaffPermissionHolder;
  isDemo: boolean;
  orderBackend: string | null;
}

/**
 * Who sees the door and gets past the screen's own gate: a real account with
 * the Reports key, on a store whose orders live in the main database (the
 * server refuses every other store with 409, and they keep the per-screen
 * exports on Orders, Sales and Customers). The server checks again.
 */
export function canOpenExport({ caller, isDemo, orderBackend }: ExportDoorInput): boolean {
  return !isDemo && orderBackend === "platform" && hasPermission(caller, "reports");
}

/** Where a door starts the dates: a preset the screen offers, exact days, or the last N days. */
export type ExportStart =
  | { preset: "today" | "yesterday" | "last_7_days" | "this_month" | "last_month" }
  | { from: string; to: string }
  | { days: number };

/**
 * The link a door pushes: Export with these sheets ticked and these dates
 * chosen. Every parameter is always written (blank when unused): the screen
 * stays mounted between visits, and a parameter left out would keep the last
 * door's value. No sheets = the screen's own starting set.
 */
export function exportHref(sheets: readonly string[] = [], start?: ExportStart): string {
  const period = start && "preset" in start ? start.preset : "";
  const from = start && "from" in start ? start.from : "";
  const to = start && "from" in start ? start.to : "";
  const days = start && "days" in start ? String(start.days) : "";
  return `${EXPORT_ROUTE}?sheets=${sheets.join(",")}&period=${period}&from=${from}&to=${to}&days=${days}`;
}

/** What each report screen's Export button starts with: that screen's own figures. */
export const SCREEN_EXPORT_SHEETS = {
  orders: ["orders", "order_lines"],
  sales: ["summary", "sales_by_day", "items"],
  profit: ["profit", "expenses", "summary"],
  stock: ["stock_on_hand", "stock_movements"],
  cash: ["shifts", "sales_by_cashier", "cash_moves"],
} as const;
