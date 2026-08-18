/**
 * Customer list → CSV.
 *
 * Deliberately limited to the columns the customers screen already shows
 * (`lib/customers/repo.ts` COLUMNS): this file is PII leaving the device, so
 * it must never widen what a merchant can already see in the app.
 */

import { toCsv, type CsvValue } from "./csv";
import { formatExportDay } from "./dates";

export interface ExportCustomerInput {
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  orderCount: number;
  totalSpent: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  channelsUsed: string[];
  smsConsent: boolean;
  smsOptOut: boolean;
}

const CUSTOMER_HEADERS = [
  "Name",
  "Phone",
  "Email",
  "Orders",
  "Total Spent",
  "Avg Order Value",
  "First Order",
  "Last Order",
  "Channels",
  "SMS Consent",
  "Notes",
] as const;

/** ISO timestamp → Manila day, or empty when absent/unparseable. */
function dayOrEmpty(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : formatExportDay(ms);
}

export function buildCustomersCsv(customers: readonly ExportCustomerInput[]): string {
  const rows: CsvValue[][] = customers.map((guest) => [
    guest.name,
    guest.phoneE164,
    guest.email,
    guest.orderCount,
    guest.totalSpent,
    guest.averageOrderValue,
    dayOrEmpty(guest.firstOrderAt),
    dayOrEmpty(guest.lastOrderAt),
    guest.channelsUsed.join("; "),
    // Consent the guest has since withdrawn is not consent.
    guest.smsConsent && !guest.smsOptOut,
    guest.notes,
  ]);
  return toCsv(CUSTOMER_HEADERS, rows);
}
