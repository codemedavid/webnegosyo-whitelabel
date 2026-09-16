/** Quantities are per parent unit. Older order payloads omit this map. */
export function validateAddonQuantities(value: unknown, addonIds: readonly string[] = []): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([id, quantity]) =>
    !['__proto__', 'prototype', 'constructor'].includes(id) &&
    addonIds.includes(id) &&
    Number.isSafeInteger(quantity) && Number(quantity) >= 1 && Number(quantity) <= 99,
  )
}
