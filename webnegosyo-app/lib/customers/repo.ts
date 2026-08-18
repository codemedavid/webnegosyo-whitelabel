/**
 * Reads and writes for customer management.
 *
 * `public.customers` lives on the platform Supabase project for EVERY tenant,
 * whatever backend serves their orders — so unlike the order screens this needs
 * no backend routing: one client, one table, all tenants. (The same reasoning
 * `lib/sms/customers-repo.ts` documents; that module stays as the narrow,
 * SMS-shaped read, this one is the management surface.)
 *
 * Two rules every function here follows:
 *
 * - **The tenant filter is always written explicitly**, on writes as well as
 *   reads. RLS scopes rows already, but relying on it alone is how a superadmin
 *   with an impersonation session pulls the whole platform's guest list — a
 *   leak this codebase has shipped once already.
 * - **A failure throws.** Resolving to `[]` on error makes a broken query
 *   render as "no customers yet" on top of a database full of them.
 */

import { supabase } from "../supabase";
import { normalizePhoneE164 } from "../phone";
import type { ValidatedCustomer } from "./validation";

/**
 * Explicit column list rather than `select("*")`: this table is PII, and a
 * wildcard ships fields (SMS consent timestamps, raw email) to screens that
 * have no use for them.
 */
const COLUMNS =
  "id, name, phone_e164, email, notes, created_source, order_count, total_spent, " +
  "average_order_value, first_order_at, last_order_at, channels_used, sms_consent, sms_opt_out";

/** Hard ceiling on one page. The list pages; nothing loads the whole table. */
const DEFAULT_PAGE_SIZE = 50;

export type CustomersSort = "recent" | "top_spend" | "frequent";

/** Kept in step with `src/lib/customers-service.ts` SORT_COLUMN. */
const SORT_COLUMN: Record<CustomersSort, string> = {
  recent: "last_order_at",
  top_spend: "total_spent",
  frequent: "order_count",
};

export interface CustomerRecord {
  id: string;
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  createdSource: string;
  orderCount: number;
  totalSpent: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  channelsUsed: string[];
  smsConsent: boolean;
  smsOptOut: boolean;
}

export interface ListCustomersParams {
  sort?: CustomersSort;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * A guest with this phone already exists for the tenant.
 *
 * Modelled as its own error so the screen can offer to open the existing guest
 * rather than showing the merchant a Postgres constraint code. The partial
 * unique index `customers_tenant_phone_uq` remains the actual backstop — the
 * pre-flight lookup in `findCustomerByPhone` narrows the race, it does not
 * close it.
 */
export class DuplicateCustomerError extends Error {
  constructor(message = "A guest with this number already exists.") {
    super(message);
    this.name = "DuplicateCustomerError";
  }
}

/** Postgres unique-violation code. */
const PG_UNIQUE_VIOLATION = "23505";

interface PostgrestFailure {
  code?: string;
  message?: string;
}

function raise(error: PostgrestFailure): never {
  if (error.code === PG_UNIQUE_VIOLATION) throw new DuplicateCustomerError();
  throw new Error(error.message ?? "Customer request failed.");
}

function toRecord(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdSource: (row.created_source as string | null) ?? "order",
    orderCount: Number(row.order_count ?? 0),
    totalSpent: Number(row.total_spent ?? 0),
    averageOrderValue: Number(row.average_order_value ?? 0),
    firstOrderAt: (row.first_order_at as string | null) ?? null,
    lastOrderAt: (row.last_order_at as string | null) ?? null,
    channelsUsed: Array.isArray(row.channels_used) ? (row.channels_used as string[]) : [],
    smsConsent: row.sms_consent === true,
    smsOptOut: row.sms_opt_out === true,
  };
}

export async function listCustomers(
  tenantId: string,
  params: ListCustomersParams = {}
): Promise<CustomerRecord[]> {
  let query = supabase.from("customers").select(COLUMNS).eq("tenant_id", tenantId);

  const search = params.search?.trim();
  if (search) {
    // The merchant types what is printed on the receipt ("0917 123 4567"), but
    // the column holds E.164. Normalizing first is what makes a phone search
    // find anybody at all; when it is not a phone, fall back to the name.
    const phone = normalizePhoneE164(search);
    query = phone
      ? query.or(`name.ilike.%${search}%,phone_e164.eq.${phone}`)
      : query.ilike("name", `%${search}%`);
  }

  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const offset = params.offset ?? 0;

  const { data, error } = await query
    .order(SORT_COLUMN[params.sort ?? "recent"], { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) raise(error as PostgrestFailure);
  return (data ?? []).map((row) => toRecord(row as unknown as Record<string, unknown>));
}

/** One export page. Bigger than the screen's page: fewer round-trips, still bounded. */
export const EXPORT_PAGE_SIZE = 200;

/**
 * Hard ceiling on export pages (25 × 200 = 5,000 guests). A store past it gets
 * a truthful `isComplete: false` instead of an unbounded loop on a phone.
 */
const EXPORT_MAX_PAGES = 25;

export interface AllCustomersResult {
  customers: CustomerRecord[];
  /** False when the page ceiling cut the list short. */
  isComplete: boolean;
}

/**
 * Every guest for the tenant, for CSV export. Pages `listCustomers` until a
 * short page; any failed page throws (a partial list shared as "all customers"
 * is a silent lie about the merchant's book).
 */
export async function fetchAllCustomersForExport(
  tenantId: string
): Promise<AllCustomersResult> {
  const customers: CustomerRecord[] = [];

  for (let pageIndex = 0; pageIndex < EXPORT_MAX_PAGES; pageIndex += 1) {
    const page = await listCustomers(tenantId, {
      limit: EXPORT_PAGE_SIZE,
      offset: pageIndex * EXPORT_PAGE_SIZE,
      sort: "recent",
    });
    customers.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) {
      return { customers, isComplete: true };
    }
  }

  return { customers, isComplete: false };
}

export async function getCustomer(
  tenantId: string,
  customerId: string
): Promise<CustomerRecord | null> {
  const { data, error } = await supabase
    .from("customers")
    .select(COLUMNS)
    // Both filters, always: scoping by id alone would let a guessed uuid read
    // another store's guest if RLS were ever relaxed.
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .maybeSingle();

  if (error) raise(error as PostgrestFailure);
  return data ? toRecord(data as unknown as Record<string, unknown>) : null;
}

/** Pre-flight dedupe lookup, so a repeat guest is offered rather than rejected. */
export async function findCustomerByPhone(
  tenantId: string,
  phoneE164: string
): Promise<CustomerRecord | null> {
  const { data, error } = await supabase
    .from("customers")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (error) raise(error as PostgrestFailure);
  return data ? toRecord(data as unknown as Record<string, unknown>) : null;
}

export async function createCustomer(
  tenantId: string,
  customer: ValidatedCustomer
): Promise<CustomerRecord> {
  const { data, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: tenantId,
      name: customer.name,
      phone_e164: customer.phoneE164,
      email: customer.email,
      notes: customer.notes,
      created_source: "manual",
      // order_count / total_spent are deliberately absent. A manual guest has
      // ordered nothing; the table defaults them to zero, and the derived
      // rollup owns them from the first real order onward.
    })
    .select(COLUMNS)
    .single();

  if (error) raise(error as PostgrestFailure);
  return toRecord(data as unknown as Record<string, unknown>);
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  customer: ValidatedCustomer
): Promise<CustomerRecord> {
  const { data, error } = await supabase
    .from("customers")
    .update({
      name: customer.name,
      phone_e164: customer.phoneE164,
      email: customer.email,
      notes: customer.notes,
      // `created_source` is never patched: editing a derived guest must not
      // relabel them as hand-entered.
    })
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .select(COLUMNS)
    .single();

  if (error) raise(error as PostgrestFailure);
  return toRecord(data as unknown as Record<string, unknown>);
}
