/**
 * Binding a manager's approval to the sale it was given for.
 *
 * The register asks for approval BEFORE the order exists, so there is no order
 * id to bind to. What the manager actually vouched for is "these people, rung
 * up by this cashier": the approval stores a fingerprint of the claimants
 * (kind, name, masked ID — the register only ever sends the masked ID) and the
 * cashier, and the sales book consumes it only for a grant whose claimants
 * produce the same fingerprint. A ₱600 approval for one senior can no longer
 * be spent on a different senior's ₱600 discount.
 *
 * Both sides normalise the same way (collapsed spaces, upper case), so a
 * stray double space typed on the register does not break the match.
 */

import { createHash } from 'node:crypto'
import { maskIdNumber, normalizeClaimantName, type GovDiscountKind } from '@/lib/gov-discount'

interface FingerprintPart {
  kind: GovDiscountKind
  name: string
  maskedId: string
}

function fingerprintOf(parts: readonly FingerprintPart[], cashierUserId: string): string {
  const entries = parts
    .map((part) => [part.kind, normalizeClaimantName(part.name).toUpperCase(), part.maskedId.replace(/\s+/g, '')].join('|'))
    .sort()
  return createHash('sha256').update(JSON.stringify({ cashier: cashierUserId, claimants: entries })).digest('hex')
}

/** What the approve route stores, from the register's request. */
export function approvalFingerprint(
  claimants: readonly { kind: GovDiscountKind; name: string; idMasked: string }[],
  cashierUserId: string,
): string {
  return fingerprintOf(
    claimants.map((claimant) => ({ kind: claimant.kind, name: claimant.name, maskedId: claimant.idMasked })),
    cashierUserId,
  )
}

/** What the sales book expects, from the grant being recorded. */
export function saleFingerprint(
  claimants: readonly { kind: GovDiscountKind; name: string; idNumber: string }[],
  cashierUserId: string,
): string {
  return fingerprintOf(
    claimants.map((claimant) => ({ kind: claimant.kind, name: claimant.name, maskedId: maskIdNumber(claimant.idNumber) })),
    cashierUserId,
  )
}
