/**
 * Rows for the extra details a customer filled in at checkout — and for the
 * receipt's "Checkout answers" block, which prints the same rows on paper.
 *
 * `customerData` is a free-form blob: checkout writes the extra fields a
 * merchant asked for (address, landmark, table number), but the platform also
 * stashes structured internals in there — the discount breakdown, the POS
 * tender, the advance-order schedule. Those are rendered by their own cards,
 * so anything that is not a scalar is dropped here rather than stringified
 * into "[object Object]".
 *
 * Mirror (deliberate duplication, like `receipt-layout.ts`) of
 * `webnegosyo-app/lib/customer-details.ts` in the merchant app. Keep the two
 * in sync.
 */

/**
 * The internal field name the checkout's address widget is keyed on: the
 * address autocomplete, the delivery fee and the radius check all hang off
 * the NAME, and so does the receipt's address block.
 */
export const DELIVERY_ADDRESS_FIELD_NAME = 'delivery_address';

/** Fields rendered elsewhere on the surface, or never meant for merchant eyes. */
const HIDDEN_FIELDS = new Set([
  'messenger_psid',
  'delivery_lat',
  'delivery_lng',
  'customer_name',
  'customer_phone',
  'customer_contact',
  // Payment proof is rendered explicitly in the Payment card, not as raw rows.
  'payment_proof_reference',
  'payment_proof_url',
  'payment_proof_public_id',
  // Platform carrier keys: machine values the customer never typed and never
  // wants to read. Each has a human twin that IS shown — the branch name for
  // the branch id, the captured label for the raw schedule instant.
  'outlet_id',
  'scheduled_for',
  '_inventory_selections',
]);

/**
 * Labels for keys that do not humanise into anything a customer would
 * recognise. Everything else is its key with the underscores taken out.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  outlet_name: 'Branch',
  scheduled_for_label: 'Scheduled For',
};

export interface CustomerDetailRow {
  key: string;
  label: string;
  value: string;
}

function formatFieldLabel(key: string): string {
  const override = LABEL_OVERRIDES[key];
  if (override) return override;
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function buildCustomerDetailRows(
  customerData?: Record<string, unknown> | null
): CustomerDetailRow[] {
  if (!customerData) return [];

  return Object.entries(customerData).reduce<CustomerDetailRow[]>((rows, [key, value]) => {
    if (HIDDEN_FIELDS.has(key)) return rows;
    if (!isScalar(value)) return rows;

    const text = String(value).trim();
    if (text === '') return rows;

    return [...rows, { key, label: formatFieldLabel(key), value: text }];
  }, []);
}
