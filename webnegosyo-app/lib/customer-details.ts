/**
 * Rows for the "Customer Details" card on the order screen.
 *
 * `customerData` is a free-form blob: checkout writes the extra fields a
 * merchant asked for (address, landmark, table number), but the platform also
 * stashes structured internals in there — the discount breakdown, the POS
 * tender, the advance-order schedule. Those are rendered by their own cards,
 * so anything that is not a scalar is dropped here rather than stringified
 * into "[object Object]".
 */

/** Fields rendered elsewhere on the screen, or never meant for merchant eyes. */
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
]);

export interface CustomerDetailRow {
  key: string;
  label: string;
  value: string;
}

function formatFieldLabel(key: string): string {
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
