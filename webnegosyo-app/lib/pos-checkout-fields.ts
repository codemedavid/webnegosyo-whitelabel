/**
 * The website's checkout questions, brought to the register.
 *
 * Each order type carries the fields a merchant set up for the storefront's
 * checkout (`customer_form_fields`): the standard four — name, phone, delivery
 * address, table — plus whatever else they asked for ("Landmark", "Preferred
 * time", a dropdown of branches). The register asks the SAME questions, so a
 * phoned-in delivery and a web order land on the order screen looking alike.
 *
 * The standard four already have dedicated controls on the register (name and
 * phone boxes, the table picker, the delivery sheet), so they are mapped onto
 * those rather than drawn twice. Everything else is a "custom" field the
 * tender screen shows under "More details". On the register EVERY field is
 * optional — a cashier with a queue must never be blocked by a question the
 * customer did not answer.
 *
 * Answers are written to `customerData` under the field's own name, exactly as
 * the web checkout writes them, so the order screen and receipt need no change.
 */

import { supabase } from "./supabase";
import { DELIVERY_ADDRESS_FIELD_NAME } from "./customer-details";

export type CheckoutFieldType = "text" | "email" | "phone" | "textarea" | "select" | "number";

/** Which register control answers a field. */
export type CheckoutFieldRole = "name" | "phone" | "address" | "table" | "custom";

export interface PosCheckoutField {
  id: string;
  orderTypeId: string;
  /** The `customerData` key the answer is stored under. */
  name: string;
  label: string;
  type: CheckoutFieldType;
  placeholder: string | null;
  /** Choices for a `select`; empty for every other type. */
  options: string[];
  role: CheckoutFieldRole;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** What the store's own delivery pricing says, for the register's fee suggestion. */
export interface DeliveryPricingSetup {
  /** The store's pin, or null when the merchant never set one. */
  store: LatLng | null;
  /** Distance pricing, or null when it is off or incomplete. */
  distance: { perKm: number; minFee: number; radiusKm: number } | null;
  /** Orders at or above this item subtotal deliver free. Null = no such offer. */
  freeDeliveryMin: number | null;
  /** Lalamove quotes its own fee; the register suggests none for these stores. */
  isLalamove: boolean;
}

export interface CheckoutSetup {
  fields: PosCheckoutField[];
  delivery: DeliveryPricingSetup;
}

export const EMPTY_CHECKOUT_SETUP: CheckoutSetup = {
  fields: [],
  delivery: { store: null, distance: null, freeDeliveryMin: null, isLalamove: false },
};

const FIELD_TYPES: readonly CheckoutFieldType[] = [
  "text",
  "email",
  "phone",
  "textarea",
  "select",
  "number",
];

/**
 * Names merchants typed for the standard questions. The seeded rows use the
 * internal names; stores that rebuilt their form used words like "Contact
 * Number" or "Full name". Matching those too keeps the register from asking
 * for the phone twice.
 */
const ROLE_ALIASES: Record<Exclude<CheckoutFieldRole, "custom">, readonly string[]> = {
  name: ["customer name", "name", "full name", "customer"],
  phone: [
    "customer phone",
    "phone",
    "phone number",
    "contact",
    "contact number",
    "contact no",
    "mobile",
    "mobile number",
    "cellphone number",
  ],
  address: ["delivery address", "address", "complete address", "complete delivery address"],
  table: ["table number", "table", "table no"],
};

/** "Contact Number " → "contact number"; "customer_phone" → "customer phone". */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function fieldRole(fieldName: string): CheckoutFieldRole {
  if (fieldName === DELIVERY_ADDRESS_FIELD_NAME) return "address";
  const normalized = normalizeName(fieldName);
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.includes(normalized)) return role as CheckoutFieldRole;
  }
  return "custom";
}

function toOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option) => (typeof option === "string" ? option.trim() : ""))
    .filter((option) => option !== "");
}

interface CheckoutFieldRow {
  id: string;
  order_type_id: string;
  field_name: string | null;
  field_label: string | null;
  field_type: string | null;
  placeholder: string | null;
  options: unknown;
}

export function toPosCheckoutField(row: CheckoutFieldRow): PosCheckoutField | null {
  const name = row.field_name ?? "";
  if (name.trim() === "") return null;
  const type = FIELD_TYPES.includes(row.field_type as CheckoutFieldType)
    ? (row.field_type as CheckoutFieldType)
    : "text";
  const options = type === "select" ? toOptions(row.options) : [];
  return {
    id: row.id,
    orderTypeId: row.order_type_id,
    name,
    label: (row.field_label ?? "").trim() || name.trim(),
    // A dropdown with no choices cannot be answered; ask it as text instead.
    type: type === "select" && options.length === 0 ? "text" : type,
    placeholder: row.placeholder?.trim() || null,
    options,
    role: fieldRole(name),
  };
}

/** The questions the register shows under "More details" for one order type. */
export function customFieldsFor(
  fields: readonly PosCheckoutField[],
  orderTypeId: string | null,
): PosCheckoutField[] {
  if (!orderTypeId) return [];
  return fields.filter((field) => field.orderTypeId === orderTypeId && field.role === "custom");
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

interface TenantDeliveryRow {
  restaurant_latitude: unknown;
  restaurant_longitude: unknown;
  distance_delivery_enabled: boolean | null;
  delivery_price_per_km: unknown;
  delivery_min_fee: unknown;
  delivery_radius_km: unknown;
  free_delivery_min_order: unknown;
  lalamove_enabled: boolean | null;
}

/** Same validity rules as the web's `resolveDistanceDeliveryConfig`. */
export function toDeliveryPricing(row: TenantDeliveryRow | null): DeliveryPricingSetup {
  if (!row) return EMPTY_CHECKOUT_SETUP.delivery;
  const lat = toNumber(row.restaurant_latitude);
  const lng = toNumber(row.restaurant_longitude);
  const perKm = toNumber(row.delivery_price_per_km);
  const minFee = toNumber(row.delivery_min_fee);
  const radiusKm = toNumber(row.delivery_radius_km);
  const freeMin = toNumber(row.free_delivery_min_order);
  const hasDistance =
    row.distance_delivery_enabled === true &&
    perKm !== null && perKm >= 0 &&
    minFee !== null && minFee >= 0 &&
    radiusKm !== null && radiusKm > 0;
  return {
    store: lat !== null && lng !== null && !(lat === 0 && lng === 0) ? { lat, lng } : null,
    distance: hasDistance ? { perKm, minFee, radiusKm } : null,
    freeDeliveryMin: freeMin !== null && freeMin > 0 ? freeMin : null,
    isLalamove: row.lalamove_enabled === true,
  };
}

const FIELD_COLUMNS = "id, order_type_id, field_name, field_label, field_type, placeholder, options";
const TENANT_DELIVERY_COLUMNS =
  "restaurant_latitude, restaurant_longitude, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, free_delivery_min_order, lalamove_enabled";

/**
 * The tenant's checkout questions and delivery pricing, in one read.
 *
 * Throws on a failed read; callers treat a missing setup as "no extra
 * questions, no suggestion" — the register still rings the sale.
 */
export async function fetchCheckoutSetup(tenantId: string): Promise<CheckoutSetup> {
  const [fieldsResult, tenantResult] = await Promise.all([
    supabase
      .from("customer_form_fields")
      .select(FIELD_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("order_index", { ascending: true }),
    supabase.from("tenants").select(TENANT_DELIVERY_COLUMNS).eq("id", tenantId).maybeSingle(),
  ]);

  if (fieldsResult.error) throw fieldsResult.error;
  if (tenantResult.error) throw tenantResult.error;

  const rows = (fieldsResult.data ?? []) as unknown as CheckoutFieldRow[];
  return {
    fields: rows
      .map(toPosCheckoutField)
      .filter((field): field is PosCheckoutField => field !== null),
    delivery: toDeliveryPricing(tenantResult.data as unknown as TenantDeliveryRow | null),
  };
}
