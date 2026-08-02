/**
 * The Customers screen's view model.
 *
 * One decision drives this whole module: **the screen shows every customer,
 * not just the textable ones.** The merchant asked to see their customer
 * database. Today zero rows carry `sms_consent` (nothing writes it until the
 * checkout opt-in ships), so filtering to the textable set would render an
 * empty screen on top of 571 real customers and read as a broken feature.
 *
 * Instead every row is listed with an honest badge saying why it can or cannot
 * be texted, and the header carries the counts. The merchant sees their
 * database and, in the same glance, exactly how much of it is reachable.
 *
 * Reachability is computed here and nowhere else. `audience.ts` applies the
 * same rules for the send path; the badge must never be able to disagree with
 * what the send loop will do.
 */

import { normalizePhoneE164 } from "../phone";
import type { SmsCustomer } from "./types";

export type ReachabilityStatus =
  | "textable"
  | "no_consent"
  | "opted_out"
  | "suppressed"
  | "no_phone";

export interface Reachability {
  status: ReachabilityStatus;
  label: string;
}

const LABELS: Record<ReachabilityStatus, string> = {
  textable: "Can text",
  no_consent: "Not opted in",
  opted_out: "Opted out",
  suppressed: "Blocked",
  no_phone: "No number",
};

/**
 * Why this customer can or cannot be texted.
 *
 * Order matters and mirrors `audience.ts`: a guest who both lacks consent and
 * opted out is shown as opted out, because that is the stronger statement and
 * the one the merchant must not talk themselves out of.
 */
export function customerReachability(
  customer: SmsCustomer,
  suppressedPhones: readonly string[]
): Reachability {
  const status = resolveStatus(customer, suppressedPhones);
  return { status, label: LABELS[status] };
}

function resolveStatus(
  customer: SmsCustomer,
  suppressedPhones: readonly string[]
): ReachabilityStatus {
  if (!customer.phone_e164) return "no_phone";
  if (customer.sms_opt_out) return "opted_out";
  if (suppressedPhones.includes(customer.phone_e164)) return "suppressed";
  if (!customer.sms_consent) return "no_consent";
  return "textable";
}

export type CustomerListFilter = "all" | "textable";

export interface CustomerListOptions {
  query: string;
  filter: CustomerListFilter;
  suppressedPhones: readonly string[];
}

export interface CustomerRow {
  customer: SmsCustomer;
  reachability: Reachability;
}

export interface CustomerListStats {
  total: number;
  textable: number;
  noConsent: number;
  optedOut: number;
  noPhone: number;
}

export interface CustomerList {
  rows: CustomerRow[];
  /** Counts across the WHOLE database, never narrowed by the search box. */
  stats: CustomerListStats;
}

/**
 * Does this customer match what the merchant typed?
 *
 * The phone comparison normalizes both sides, because the merchant reads
 * "0917 000 0002" off a receipt while the row stores "+639170000002". Matching
 * the raw strings would make search look broken for the single most obvious
 * thing anyone would search by.
 */
function matchesQuery(customer: SmsCustomer, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;

  if ((customer.name ?? "").toLowerCase().includes(needle)) return true;
  if ((customer.phone_e164 ?? "").toLowerCase().includes(needle)) return true;

  const normalizedNeedle = normalizePhoneE164(needle);
  return normalizedNeedle !== null && normalizedNeedle === customer.phone_e164;
}

function byRecencyDesc(a: CustomerRow, b: CustomerRow): number {
  const aTime = a.customer.last_order_at ? new Date(a.customer.last_order_at).getTime() : 0;
  const bTime = b.customer.last_order_at ? new Date(b.customer.last_order_at).getTime() : 0;
  return bTime - aTime;
}

export function buildCustomerList(
  customers: readonly SmsCustomer[],
  options: CustomerListOptions
): CustomerList {
  const all: CustomerRow[] = customers.map((customer) => ({
    customer,
    reachability: customerReachability(customer, options.suppressedPhones),
  }));

  const rows = all
    .filter((row) => options.filter !== "textable" || row.reachability.status === "textable")
    .filter((row) => matchesQuery(row.customer, options.query))
    .sort(byRecencyDesc);

  const count = (status: ReachabilityStatus) =>
    all.filter((row) => row.reachability.status === status).length;

  return {
    rows,
    // Deliberately computed over `all`: the header must keep telling the truth
    // about the database while the search box is narrowing what is on screen.
    stats: {
      total: all.length,
      textable: count("textable"),
      noConsent: count("no_consent"),
      optedOut: count("opted_out"),
      noPhone: count("no_phone"),
    },
  };
}
