/**
 * Finding or saving the guest a counter sale belongs to — without the guest list.
 *
 * `public.customers` is readable only with the `customers` staff grant (see
 * `supabase/migrations/20261004180000_customers_staff_permission.sql`). Before
 * that, the POS picker read the table directly and an empty search returned
 * the store's most recent guests to any cashier: the tab bar was the only gate.
 *
 * A register-only cashier still has to attach a guest, so two narrow definer
 * functions stand in for the table:
 * - `pos_find_customer` — EXACT phone or email, one row at most, only the
 *   fields attaching needs. Nothing is browsable by fragment.
 * - `pos_create_customer` — the counter quick-create.
 *
 * Staff who hold `customers` keep the searchable list (`listCustomers`), since
 * they can read the whole book anyway.
 */

import { supabase } from "../supabase";
import { normalizePhoneE164 } from "../phone";
import { DuplicateCustomerError, listCustomers } from "./repo";
import type { ValidatedCustomer } from "./validation";

/** What a sale needs to know about its guest — nothing more. */
export interface AttachableCustomer {
  id: string;
  name: string | null;
  phoneE164: string | null;
  email: string | null;
}

/** The picker's page size for a grant holder's free-text search. */
const BROWSE_LIMIT = 20;

/** Postgres unique-violation code (customers_tenant_phone_uq). */
const PG_UNIQUE_VIOLATION = "23505";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RpcFailure {
  code?: string;
  message?: string;
}

interface AttachRow {
  id: unknown;
  name: unknown;
  phone_e164: unknown;
  email: unknown;
}

/**
 * A failed register call, with the Postgres/PostgREST code kept so a caller can
 * tell a permission refusal (42501) from a missing function or a network drop.
 */
export interface AttachLookupError extends Error {
  code: string | null;
}

function attachLookupError(failure: RpcFailure, fallback: string): AttachLookupError {
  return Object.assign(new Error(failure.message ?? fallback), { code: failure.code ?? null });
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function toAttachable(row: AttachRow): AttachableCustomer {
  return {
    id: String(row.id),
    name: textOrNull(row.name),
    phoneE164: textOrNull(row.phone_e164),
    email: textOrNull(row.email),
  };
}

function pickAttachable(record: AttachableCustomer): AttachableCustomer {
  return { id: record.id, name: record.name, phoneE164: record.phoneE164, email: record.email };
}

function rowsOf(data: unknown): AttachRow[] {
  return Array.isArray(data) ? (data as AttachRow[]) : [];
}

/** The exact contact the cashier typed, or null when it is neither a phone nor an email. */
function exactContact(query: string): { phoneE164: string | null; email: string | null } | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;
  const phoneE164 = normalizePhoneE164(trimmed);
  if (phoneE164) return { phoneE164, email: null };
  const email = trimmed.toLowerCase();
  return EMAIL_RE.test(email) ? { phoneE164: null, email } : null;
}

async function findExact(
  tenantId: string,
  contact: { phoneE164: string | null; email: string | null }
): Promise<AttachableCustomer[]> {
  const { data, error } = await supabase.rpc("pos_find_customer", {
    p_tenant_id: tenantId,
    p_phone_e164: contact.phoneE164,
    p_email: contact.email,
  });
  if (error) throw attachLookupError(error as RpcFailure, "Customer lookup failed.");
  return rowsOf(data).map(toAttachable);
}

/**
 * The guests the picker offers for what the cashier typed.
 *
 * Without the `customers` grant only an exact phone/email is looked up; an
 * empty box or a name fragment reads nothing at all. Throws on a failed read so
 * the sheet can say so instead of showing "nobody matches".
 */
export async function findAttachableCustomers(
  tenantId: string,
  query: string,
  canBrowse: boolean
): Promise<AttachableCustomer[]> {
  if (canBrowse) {
    const records = await listCustomers(tenantId, { search: query, limit: BROWSE_LIMIT });
    return records.map(pickAttachable);
  }

  const contact = exactContact(query);
  if (!contact) return [];
  return findExact(tenantId, contact);
}

/** The guest with exactly this number, or null. */
export async function findAttachableByPhone(
  tenantId: string,
  phoneE164: string
): Promise<AttachableCustomer | null> {
  const [found] = await findExact(tenantId, { phoneE164, email: null });
  return found ?? null;
}

/**
 * Save a guest met at the counter. A number already on file throws
 * `DuplicateCustomerError`, so the sheet can point the cashier at the search.
 */
export async function createAttachableCustomer(
  tenantId: string,
  customer: ValidatedCustomer
): Promise<AttachableCustomer> {
  const { data, error } = await supabase.rpc("pos_create_customer", {
    p_tenant_id: tenantId,
    p_name: customer.name,
    p_phone_e164: customer.phoneE164,
    p_email: customer.email,
  });
  if (error) {
    const failure = error as RpcFailure;
    if (failure.code === PG_UNIQUE_VIOLATION) throw new DuplicateCustomerError();
    throw attachLookupError(failure, "Could not save that guest.");
  }

  const [created] = rowsOf(data).map(toAttachable);
  if (!created) throw new Error("Could not save that guest.");
  return created;
}
