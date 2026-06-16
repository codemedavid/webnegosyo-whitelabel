// QR-handoff ordering payload types.
//
// A web-storefront customer builds an order which is encoded into a QR code
// shown on a thank-you page. The vendor's webnegosyo app scans the QR, previews
// it, and writes it to Convex via the existing createOrder mutation. No
// customer-side code path ever writes to Convex or Supabase.
//
// These types are mirrored byte-for-byte inside
// webnegosyo-app/lib/qr-order-codec.ts so the codec stays identical on web and
// React Native. Keep the two definitions in sync.

export interface QrOrderItemV1 {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  variationSelections?: {
    typeName: string;
    optionName: string;
    priceAdjustment: number;
  }[];
  variation?: string;
  addons?: { name: string; price: number; quantity?: number }[];
  specialInstructions?: string;
  isUpsellItem?: boolean;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

export interface QrOrderPayloadV1 {
  v: 1;
  cid: string; // clientOrderId = crypto.randomUUID()
  t: number; // creation time in Unix epoch milliseconds
  tenantId: string;
  tenantSlug: string;
  orderTypeId: string;
  orderType: string; // label, e.g. "dine_in"
  customerName: string;
  customerContact: string;
  customerData: Record<string, unknown>; // dynamic form-field values
  items: QrOrderItemV1[];
  total: number; // client-computed grand total (vendor re-validates)
  paymentMethodId?: string;
  paymentMethod?: string;
  scheduledFor?: string; // advance order: requested fulfillment time (UTC ISO); absent = ASAP
  scheduledForLabel?: string; // advance order: human label captured in customer's local time
  ck: string; // checksum (see codec)
}
