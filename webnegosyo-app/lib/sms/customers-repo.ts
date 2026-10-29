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

const DAY_MS = 86_400_000;
/** sms_settings.guest_cap_days default (store never saved its texting rules). */
const DEFAULT_GUEST_CAP_DAYS = 3;
const MAX_RECENT_ROWS = 2000;

/**
 * Phones this store texted recently — by a campaign OR an automation — inside
 * its "one text per guest every N days" window (`sms_settings`, default 3).
 * A campaign skips them, so a guest who just got a win-back automation is not
 * texted again by a weekend blast the next morning. Throws rather than
 * returning [] on a failed read: an empty list would quietly re-text everyone.
 */
export async function listRecentlyTextedPhones(tenantId: string, now: Date = new Date()): Promise<Set<string>> {
  const { data: rules, error: rulesError } = await supabase
    .from("sms_settings")
    .select("guest_cap_days")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rulesError) throw new Error(rulesError.message);
  const capDays = Number((rules as { guest_cap_days?: unknown } | null)?.guest_cap_days) || DEFAULT_GUEST_CAP_DAYS;
  const since = new Date(now.getTime() - capDays * DAY_MS).toISOString();

  const [campaigns, automations] = await Promise.all([
    supabase.from("sms_sends").select("phone_e164")
      .eq("tenant_id", tenantId).eq("result", "sent").gte("sent_at", since).limit(MAX_RECENT_ROWS),
    supabase.from("sms_outbox").select("phone_e164")
      // The owner's test texts (web Texts) never count against a guest.
      .eq("tenant_id", tenantId).neq("source", "test").in("status", ["sent", "claimed"]).gte("created_at", since).limit(MAX_RECENT_ROWS),
  ]);
  for (const result of [campaigns, automations]) if (result.error) throw new Error(result.error.message);
  return new Set(
    [...(campaigns.data ?? []), ...(automations.data ?? [])].map((row) => String((row as { phone_e164: unknown }).phone_e164)),
  );
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
