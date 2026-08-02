/**
 * Reads for the Customers screen.
 *
 * `public.customers` lives on the platform Supabase project for EVERY tenant,
 * whatever backend serves their orders — Convex- and tenant-Supabase-backed
 * stores are fed into it by `customer_external_orders` on the web side. So
 * unlike the order screens, this needs no backend routing: one client, one
 * table, all tenants.
 *
 * RLS scopes rows to the caller's tenant, but the `tenant_id` filter is still
 * written explicitly. Relying on RLS alone would silently return the whole
 * platform's guest list to a superadmin who opened the screen while
 * impersonating, which is exactly the kind of leak the impersonation path has
 * produced before.
 */

import { supabase } from "../supabase";
import type { SmsCustomer } from "./types";

/** Column list kept explicit: a `select("*")` here would ship PII we never use. */
const CUSTOMER_COLUMNS =
  "id, name, phone_e164, order_count, total_spent, last_order_at, channels_used, sms_consent, sms_opt_out";

/** Hard ceiling on one screen's read. Paging lands with the campaign editor. */
const MAX_CUSTOMERS = 1000;

function toSmsCustomer(row: Record<string, unknown>): SmsCustomer {
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    phone_e164: (row.phone_e164 as string | null) ?? null,
    order_count: Number(row.order_count ?? 0),
    total_spent: Number(row.total_spent ?? 0),
    last_order_at: (row.last_order_at as string | null) ?? null,
    channels_used: Array.isArray(row.channels_used) ? (row.channels_used as string[]) : [],
    sms_consent: row.sms_consent === true,
    sms_opt_out: row.sms_opt_out === true,
  };
}

export async function listCustomers(tenantId: string): Promise<SmsCustomer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .limit(MAX_CUSTOMERS);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toSmsCustomer(row as Record<string, unknown>));
}

export async function listSuppressedPhones(tenantId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("sms_suppressions")
    .select("phone_e164")
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { phone_e164: unknown }).phone_e164));
}

/**
 * Record or withdraw a guest's consent to be texted.
 *
 * `sms_consent` is written as a real boolean, never a string: both read sites
 * compare with `=== true`, so a `"true"` would look captured on screen and be
 * silently ignored by every audience query.
 *
 * `sms_opt_out` is deliberately left alone. Consent and opt-out are separate
 * statements, and folding them together here is how a guest's "do not text me"
 * gets undone by a helpful tap at the counter.
 */
export async function setCustomerConsent(
  customerId: string,
  hasConsented: boolean
): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({
      sms_consent: hasConsented,
      sms_consent_at: hasConsented ? new Date().toISOString() : null,
    })
    .eq("id", customerId);

  if (error) throw new Error(error.message);
}

/** Flip a guest's do-not-text flag. Writing the timestamp is what makes it auditable. */
export async function setCustomerOptOut(customerId: string, optOut: boolean): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({
      sms_opt_out: optOut,
      sms_opt_out_at: optOut ? new Date().toISOString() : null,
    })
    .eq("id", customerId);

  if (error) throw new Error(error.message);
}
