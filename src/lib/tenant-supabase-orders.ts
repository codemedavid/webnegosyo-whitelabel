import type { SupabaseClient } from "@supabase/supabase-js";
import { generateOrderTokenPair, type OrderTokenPair } from "@/lib/order-token";
import { resolveOrderContact } from "@/lib/customer-identity";

/**
 * Order writes against a tenant's OWN Supabase project (`order_backend = 'supabase'`).
 *
 * The sibling of `createOrderConvex`, but with a meaningfully easier job: the
 * tenant bundle in `src/lib/supabase-order-schema.ts` is a near-mirror of the
 * platform `orders` table, so payment proof and advance-order schedules land in
 * real columns instead of being smuggled through `customer_data` the way the
 * Convex path is forced to.
 *
 * What deliberately does NOT move to the tenant project: menu items, order
 * types, and payment methods all still live on the platform, so every price and
 * IDOR check runs against the platform database *before* this is called (see
 * `createOrderAction`). Only the order itself crosses over.
 *
 * Row construction is split into pure builders so the shape of what we write is
 * verifiable without a database.
 */

export interface TenantOrderItemInput {
  menu_item_id: string;
  menu_item_name: string;
  variation?: string;
  addons?: Array<string | { name: string; price?: number; quantity?: number }>;
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions?: string;
}

export interface TenantOrderInput {
  tenantId: string;
  items: TenantOrderItemInput[];
  customerInfo?: { name?: string; contact?: string };
  orderTypeId?: string;
  orderTypeName?: string | null;
  customerData?: Record<string, unknown>;
  deliveryFee?: number;
  lalamoveQuotationId?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  paymentMethodDetails?: string;
  paymentMethodQrCodeUrl?: string;
  serviceChargeAmount?: number;
  scheduledForISO?: string;
  paymentProof?: {
    url?: string | null;
    publicId?: string | null;
    reference?: string | null;
  };
}

export type TenantOrderTokenPair = OrderTokenPair;

/** Mirrors the `orders` columns in the tenant order-schema bundle. */
export interface TenantOrderRow {
  tenant_id: string;
  order_type_id: string | null;
  order_type: string | null;
  customer_name: string | null;
  customer_contact: string | null;
  customer_data: Record<string, unknown>;
  scheduled_for: string | null;
  total: number;
  delivery_fee: number;
  service_charge_amount: number;
  lalamove_quotation_id: string | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_method_details: string | null;
  payment_method_qr_code_url: string | null;
  payment_status: "pending";
  status: "pending";
  payment_proof_url: string | null;
  payment_proof_public_id: string | null;
  payment_proof_reference: string | null;
  payment_proof_uploaded_at: string | null;
  order_token_hash: string;
  order_token_expires_at: string;
}

/** Mirrors the `order_items` columns in the tenant order-schema bundle. */
export interface TenantOrderItemRow {
  order_id: string;
  menu_item_id: string;
  menu_item_name: string;
  variation: string | null;
  addons: string[];
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions: string | null;
}

const MAX_FIELD_LENGTH = 500;

function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the `orders` row.
 *
 * The token hash rides along in the INSERT rather than a follow-up UPDATE: it
 * saves a round trip and closes the window in which a saved order has no token.
 */
export function buildTenantOrderRow(
  input: TenantOrderInput,
  tokenPair: OrderTokenPair
): TenantOrderRow {
  const itemsTotal = input.items.reduce((sum, item) => sum + item.subtotal, 0);
  const deliveryFee = input.deliveryFee ?? 0;
  const serviceCharge = input.serviceChargeAmount ?? 0;

  const proofUrl = nullIfBlank(input.paymentProof?.url);
  const proofReference = nullIfBlank(input.paymentProof?.reference)?.slice(
    0,
    MAX_FIELD_LENGTH
  ) ?? null;
  const hasProof = Boolean(proofUrl || proofReference);

  return {
    tenant_id: input.tenantId,
    order_type_id: input.orderTypeId || null,
    order_type: input.orderTypeName ?? null,
    customer_name: nullIfBlank(input.customerInfo?.name),
    // Fall back to deriving identity from the raw form data so orders never lose
    // their customer, which would otherwise collapse every anonymous-looking
    // order into a single fake customer in analytics.
    customer_contact:
      nullIfBlank(input.customerInfo?.contact) ??
      nullIfBlank(
        resolveOrderContact({
          name: input.customerInfo?.name,
          contact: input.customerInfo?.contact,
          customerData: input.customerData,
        })
      ),
    customer_data: input.customerData ?? {},
    scheduled_for: input.scheduledForISO ?? null,
    total: itemsTotal + deliveryFee + serviceCharge,
    delivery_fee: deliveryFee,
    service_charge_amount: serviceCharge,
    lalamove_quotation_id: input.lalamoveQuotationId || null,
    payment_method_id: input.paymentMethodId || null,
    payment_method_name: input.paymentMethodName || null,
    payment_method_details: input.paymentMethodDetails || null,
    payment_method_qr_code_url: input.paymentMethodQrCodeUrl || null,
    payment_status: "pending",
    status: "pending",
    payment_proof_url: proofUrl,
    payment_proof_public_id: nullIfBlank(input.paymentProof?.publicId),
    payment_proof_reference: proofReference,
    payment_proof_uploaded_at: hasProof ? new Date().toISOString() : null,
    order_token_hash: tokenPair.tokenHash,
    order_token_expires_at: tokenPair.expiresAt,
  };
}

/**
 * Build the `order_items` rows. Addons are flattened to names because the
 * tenant bundle types that column as `text[]` (the platform shape), whereas the
 * cart may carry priced addon objects.
 */
export function buildTenantOrderItemRows(
  orderId: string,
  items: TenantOrderItemInput[]
): TenantOrderItemRow[] {
  return items.map((item) => ({
    order_id: orderId,
    menu_item_id: item.menu_item_id,
    menu_item_name: item.menu_item_name,
    variation: item.variation ?? null,
    addons: (item.addons ?? []).map((addon) =>
      typeof addon === "string" ? addon : addon.name
    ),
    quantity: item.quantity,
    price: item.price,
    subtotal: item.subtotal,
    special_instructions: item.special_instructions ?? null,
  }));
}

/** Injected so tests get a deterministic token instead of real randomness. */
export interface TenantOrderWriteDeps {
  generateToken?: () => OrderTokenPair;
}

export interface TenantOrderWriteResult {
  order: { id: string } & Record<string, unknown>;
  orderToken: string;
}

/**
 * Insert an order and its line items into the tenant's own Supabase project.
 *
 * Throws on any write failure — the caller (checkout) must surface the error
 * rather than silently falling back to the platform database, which would split
 * a tenant's orders across two backends without anyone noticing.
 */
export async function createOrderTenantSupabase(
  client: SupabaseClient,
  input: TenantOrderInput,
  deps: TenantOrderWriteDeps = {}
): Promise<TenantOrderWriteResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Order must contain at least one item");
  }

  const tokenPair = (deps.generateToken ?? generateOrderTokenPair)();
  const orderRow = buildTenantOrderRow(input, tokenPair);

  const { data: order, error: orderError } = await client
    .from("orders")
    .insert(orderRow)
    .select()
    .single();

  if (orderError || !order) {
    throw new Error(
      `Failed to create order in the tenant Supabase project: ${
        orderError?.message ?? "no row returned"
      }`
    );
  }

  const createdOrder = order as { id: string } & Record<string, unknown>;
  const itemRows = buildTenantOrderItemRows(createdOrder.id, input.items);

  const { error: itemsError } = await client.from("order_items").insert(itemRows);

  if (itemsError) {
    // An order with no line items would surface in the merchant queue as an
    // unfulfillable ghost. Roll it back; the cascade on order_items makes this
    // safe, and a failed cleanup must not mask the original error.
    try {
      await client.from("orders").delete().eq("id", createdOrder.id);
    } catch (cleanupError) {
      console.error(
        "[createOrderTenantSupabase] orphan order cleanup failed:",
        cleanupError instanceof Error ? cleanupError.message : cleanupError,
        { orderId: createdOrder.id, tenantId: input.tenantId }
      );
    }

    throw new Error(
      `Failed to create order items in the tenant Supabase project: ${itemsError.message}`
    );
  }

  return { order: createdOrder, orderToken: tokenPair.token };
}
