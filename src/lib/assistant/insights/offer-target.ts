/**
 * A live offer's ref target, as one string the ref book can hold. Combos and
 * upgrades have a row id; a pairing is addressed by its source dishes (its
 * writers take `sourceIds`), so its target lists them.
 */

import type { OfferTarget } from '@/lib/assistant/actions/kinds'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodeOfferTarget(target: OfferTarget): string {
  return target.kind === 'pairing' ? `pairing:${[...target.sourceIds].sort().join(',')}` : `${target.kind}:${target.id}`
}

/** Null for anything that is not a well-formed target (a stale or forged ref). */
export function decodeOfferTarget(value: string | null): OfferTarget | null {
  if (!value) return null
  const colon = value.indexOf(':')
  if (colon <= 0) return null
  const kind = value.slice(0, colon)
  const rest = value.slice(colon + 1)
  if (kind === 'combo' || kind === 'upgrade') return UUID.test(rest) ? { kind, id: rest } : null
  if (kind !== 'pairing') return null
  const sourceIds = rest.split(',')
  return sourceIds.length > 0 && sourceIds.every((id) => UUID.test(id)) ? { kind, sourceIds } : null
}
