/**
 * The id shapes Messenger code checks before it reads or writes anything.
 * Pure and browser-safe (`payload.ts` runs in the Studio's chat simulator).
 */

export { isUuid } from '@/lib/uuid'

/** A Page-scoped user id as Meta hands it out: digits only. */
const PSID_PATTERN = /^\d{5,32}$/

export function isPsid(value: unknown): value is string {
  return typeof value === 'string' && PSID_PATTERN.test(value)
}
