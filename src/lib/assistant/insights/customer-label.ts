/**
 * How a customer is named to the MODEL: first name and last initial only, and
 * never a phone number. The owner's card (rendered in their own browser, under
 * the `customers` permission) can show the saved name.
 */

export function maskCustomerName(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Unnamed guest'
  const [first, ...rest] = parts
  const last = rest[rest.length - 1]
  return last ? `${first} ${last[0].toUpperCase()}.` : first
}

/**
 * A staff label for the model. Accounts without a display name are labelled
 * by their email; the model gets only the part before the @.
 */
export function staffLabel(name: string): string {
  const trimmed = name.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return trimmed || 'Staff member'
  // Keep the domain's first label so two "admin@" accounts stay distinguishable.
  const domain = trimmed.slice(at + 1).split('.')[0]
  return domain ? `${trimmed.slice(0, at)} (${domain})` : trimmed.slice(0, at)
}
