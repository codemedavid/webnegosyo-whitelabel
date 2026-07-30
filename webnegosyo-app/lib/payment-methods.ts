/**
 * Managing the tenant's payment methods from the merchant app.
 *
 * This is the deliberate opposite of the register's read in pos-catalog.ts.
 * There, `listPaymentMethods` answers "what may I take payment with right
 * now?" and so filters to active methods inner-joined to one order type. Here
 * the merchant is asking "what have I set up?", so nothing is filtered out: the
 * deactivated method and the method linked to no order type are precisely the
 * two rows they came to find and fix, and hiding either would read as the row
 * having been deleted.
 *
 * The order-type links live in their own junction table, so `order_type_ids` is
 * a shape this module invents for the editor — it is flattened on the way in
 * and stripped back out on the way to `payment_methods`, whose row has no such
 * column.
 */

import { supabase } from "./supabase";

/** A payment method as the management screens see it. */
export interface ManagedPaymentMethod {
  id: string;
  tenant_id: string;
  name: string;
  details: string | null;
  qr_code_url: string | null;
  is_active: boolean;
  order_index: number;
  require_payment_proof: boolean;
  /** Flattened from `payment_method_order_types`; empty means offered nowhere. */
  order_type_ids: string[];
}

/** The editable fields, as the form holds them. */
export interface PaymentMethodInput {
  name: string;
  details: string;
  qr_code_url: string;
  is_active: boolean;
  require_payment_proof: boolean;
  order_type_ids: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export type MoveDirection = "up" | "down";

/** Pristine form values for adding a new method. */
export const EMPTY_PAYMENT_METHOD_INPUT: PaymentMethodInput = {
  name: "",
  details: "",
  qr_code_url: "",
  is_active: true,
  require_payment_proof: false,
  order_type_ids: [],
};

const MIN_NAME_LENGTH = 2;
const ALLOWED_QR_PROTOCOLS = ["http:", "https:"];

interface JunctionRow {
  order_type_id: string;
}

interface PaymentMethodRow {
  id: string;
  tenant_id: string;
  name: string;
  details: string | null;
  qr_code_url: string | null;
  is_active: boolean;
  order_index: number;
  require_payment_proof: boolean | null;
  payment_method_order_types: JunctionRow[] | null;
}

/** All editor state derived from a loaded method, or a clean slate when null. */
export interface EditorFormState {
  form: PaymentMethodInput;
}

/**
 * Resolve the editor's initial state from a loaded method, or a clean slate
 * when `loaded` is null.
 *
 * The editor is reached repeatedly from a persistent tab tree, so the add path
 * has to return a fresh copy of {@link EMPTY_PAYMENT_METHOD_INPUT} — a shared
 * reference would let one edit bleed into the next "New method" form.
 */
export function buildEditorFormState(
  loaded: ManagedPaymentMethod | null,
): EditorFormState {
  if (!loaded) {
    return {
      form: { ...EMPTY_PAYMENT_METHOD_INPUT, order_type_ids: [] },
    };
  }

  return {
    form: {
      name: loaded.name ?? "",
      // Null columns are rendered as empty inputs; "null" in a text box is the
      // classic way a merchant ends up saving the word null into their QR line.
      details: loaded.details ?? "",
      qr_code_url: loaded.qr_code_url ?? "",
      is_active: loaded.is_active ?? true,
      require_payment_proof: loaded.require_payment_proof ?? false,
      order_type_ids: [...(loaded.order_type_ids ?? [])],
    },
  };
}

function isUsableQrUrl(value: string): boolean {
  try {
    return ALLOWED_QR_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validatePaymentMethodInput(
  input: PaymentMethodInput,
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || input.name.trim().length < MIN_NAME_LENGTH) {
    errors.name = `Name must be at least ${MIN_NAME_LENGTH} characters`;
  }

  if (input.order_type_ids.length === 0) {
    // Saving with none succeeds at the database and then shows up nowhere,
    // which the merchant reads as the save having silently failed.
    errors.order_type_ids = "Choose at least one order type";
  }

  if (input.qr_code_url.trim() && !isUsableQrUrl(input.qr_code_url.trim())) {
    errors.qr_code_url = "QR code must be a valid image link";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function assertValid(input: PaymentMethodInput): void {
  const { valid, errors } = validatePaymentMethodInput(input);
  if (!valid) {
    throw new Error(Object.values(errors).join("; "));
  }
}

/** True when this method is linked to no order type, so no channel offers it. */
export function isOfferedNowhere(method: ManagedPaymentMethod): boolean {
  return method.order_type_ids.length === 0;
}

/**
 * Move one method one place up or down, renumbering every position.
 *
 * `order_index` is what the storefront sorts by, so a swap that reordered the
 * array without renumbering would look correct on this screen and change
 * nothing at checkout. Pure: the caller's list is left untouched.
 */
export function moveMethod(
  methods: readonly ManagedPaymentMethod[],
  id: string,
  direction: MoveDirection,
): ManagedPaymentMethod[] {
  const from = methods.findIndex((m) => m.id === id);
  const to = direction === "up" ? from - 1 : from + 1;

  const reindex = (list: readonly ManagedPaymentMethod[]) =>
    list.map((method, index) => ({ ...method, order_index: index }));

  if (from === -1 || to < 0 || to >= methods.length) return reindex(methods);

  const reordered = [...methods];
  reordered[from] = methods[to];
  reordered[to] = methods[from];
  return reindex(reordered);
}

/** The row payload written to `payment_methods`, without the invented links. */
function toRow(input: PaymentMethodInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    // Empty text is stored as NULL so "no instructions" is one value in the
    // database rather than two the storefront has to test for separately.
    details: input.details.trim() || null,
    qr_code_url: input.qr_code_url.trim() || null,
    is_active: input.is_active,
    require_payment_proof: input.require_payment_proof,
  };
}

function toManaged(row: PaymentMethodRow): ManagedPaymentMethod {
  const { payment_method_order_types, require_payment_proof, ...rest } = row;
  return {
    ...rest,
    require_payment_proof: require_payment_proof ?? false,
    order_type_ids: (payment_method_order_types ?? []).map(
      (link) => link.order_type_id,
    ),
  };
}

/** Every payment method the tenant has, active or not, linked or not. */
export async function listManagedPaymentMethods(
  tenantId: string,
): Promise<ManagedPaymentMethod[]> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select(
      "id, tenant_id, name, details, qr_code_url, is_active, order_index, require_payment_proof, payment_method_order_types(order_type_id)",
    )
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as PaymentMethodRow[]).map(toManaged);
}

/** One method with its links, or null when it is not this tenant's. */
export async function getPaymentMethod(
  methodId: string,
  tenantId: string,
): Promise<ManagedPaymentMethod | null> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select(
      "id, tenant_id, name, details, qr_code_url, is_active, order_index, require_payment_proof, payment_method_order_types(order_type_id)",
    )
    .eq("id", methodId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data ? toManaged(data as unknown as PaymentMethodRow) : null;
}

/** The position a newly added method takes: after everything already there. */
async function nextOrderIndex(tenantId: string): Promise<number> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select("order_index")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const highest = (data as { order_index?: number } | null)?.order_index;
  return highest === undefined || highest === null ? 0 : highest + 1;
}

/**
 * Replace a method's order-type links with exactly the ones chosen.
 *
 * Delete-then-insert, mirroring the web's `updatePaymentMethodOrderTypes`:
 * inserting alone would accumulate links and keep re-offering the method on a
 * channel the merchant just unticked. A failed clear aborts rather than
 * inserting duplicates on top of the links it could not remove.
 */
export async function setOrderTypes(
  methodId: string,
  orderTypeIds: readonly string[],
): Promise<void> {
  const { error: clearError } = await supabase
    .from("payment_method_order_types")
    .delete()
    .eq("payment_method_id", methodId);

  if (clearError) throw clearError;
  if (orderTypeIds.length === 0) return;

  const { error: linkError } = await supabase
    .from("payment_method_order_types")
    .insert(
      orderTypeIds.map((orderTypeId) => ({
        payment_method_id: methodId,
        order_type_id: orderTypeId,
      })),
    );

  if (linkError) throw linkError;
}

export async function createPaymentMethod(
  tenantId: string,
  input: PaymentMethodInput,
): Promise<string> {
  assertValid(input);

  const orderIndex = await nextOrderIndex(tenantId);

  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ tenant_id: tenantId, ...toRow(input), order_index: orderIndex })
    .select("id")
    .single();

  if (error) throw error;

  const created = (data as { id: string }).id;
  await setOrderTypes(created, input.order_type_ids);
  return created;
}

export async function updatePaymentMethod(
  methodId: string,
  tenantId: string,
  input: PaymentMethodInput,
): Promise<void> {
  assertValid(input);

  // Scoped by tenant as well as id: id alone would let a stale or guessed id
  // rewrite another store's method.
  const { error } = await supabase
    .from("payment_methods")
    .update(toRow(input))
    .eq("id", methodId)
    .eq("tenant_id", tenantId)
    .select("id")
    .single();

  if (error) throw error;

  await setOrderTypes(methodId, input.order_type_ids);
}

export async function togglePaymentMethodStatus(
  methodId: string,
  tenantId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("payment_methods")
    .update({ is_active: isActive })
    .eq("id", methodId)
    .eq("tenant_id", tenantId)
    .select("id")
    .single();

  if (error) throw error;
}

export async function deletePaymentMethod(
  methodId: string,
  tenantId: string,
): Promise<void> {
  const { error } = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", methodId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

/** Persist the positions produced by {@link moveMethod}. */
export async function reorderPaymentMethods(
  tenantId: string,
  methods: readonly ManagedPaymentMethod[],
): Promise<void> {
  for (const method of methods) {
    const { error } = await supabase
      .from("payment_methods")
      .update({ order_index: method.order_index })
      .eq("id", method.id)
      .eq("tenant_id", tenantId);

    if (error) throw error;
  }
}
