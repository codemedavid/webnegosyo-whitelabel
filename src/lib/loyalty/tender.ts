export interface FrozenPaymentMethod {
  readonly id: string
  readonly kind: 'cash' | 'manual'
  readonly requiresReference: boolean
}

/** Trusted quote snapshot, never supplied by the cashier's tender request. */
export interface FrozenPaymentPolicy {
  readonly totalCentavos: number
  readonly allowedMethods: readonly FrozenPaymentMethod[]
}

/** Manual tender is a cashier attestation, never provider-verified payment. */
export interface NormalizedTender {
  methodId: string
  kind: 'cash' | 'manual'
  amountTenderedCentavos: number
  changeCentavos: number
  reference: string | null
}

export type TenderValidationError =
  | 'invalid_policy'
  | 'invalid_tender'
  | 'unknown_method'
  | 'invalid_amount'
  | 'insufficient_cash'
  | 'manual_amount_mismatch'
  | 'invalid_reference'
  | 'reference_required'

export type TenderValidationResult =
  | { ok: true; value: NormalizedTender }
  | { ok: false; error: TenderValidationError }

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isPolicy(value: unknown): value is FrozenPaymentPolicy {
  if (!isRecord(value) || !isMoney(value.totalCentavos)
    || Reflect.ownKeys(value).some(key => !['totalCentavos', 'allowedMethods'].includes(key as string))
    || !Array.isArray(value.allowedMethods) || value.allowedMethods.length === 0) return false
  const ids = new Set<string>()
  for (const method of value.allowedMethods) {
    if (!isRecord(method) || typeof method.id !== 'string' || !method.id
      || Reflect.ownKeys(method).some(key => !['id', 'kind', 'requiresReference'].includes(key as string))
      || method.id.trim() !== method.id || ids.has(method.id)
      || (method.kind !== 'cash' && method.kind !== 'manual')
      || typeof method.requiresReference !== 'boolean') return false
    ids.add(method.id)
  }
  return true
}

/**
 * Validates JSON tender against a server-owned quote snapshot. A zero-total
 * quote accepts zero cash; over-tendered cash is returned entirely as change.
 * The result records cashier attestation only: it neither verifies transfers
 * with a provider nor validates uploaded proof. Callers must not translate
 * uploaded-proof requirements into requiresReference.
 */
export function validateTender(policy: unknown, tender: unknown): TenderValidationResult {
  if (!isPolicy(policy)) return { ok: false, error: 'invalid_policy' }
  if (!isRecord(tender) || typeof tender.methodId !== 'string' || !tender.methodId
    || Reflect.ownKeys(tender).some(key => !['methodId', 'amountTenderedCentavos', 'reference'].includes(key as string))) {
    return { ok: false, error: 'invalid_tender' }
  }
  const frozen = policy
  if (!isMoney(tender.amountTenderedCentavos)) return { ok: false, error: 'invalid_amount' }
  const amountTenderedCentavos = tender.amountTenderedCentavos
  const method = frozen.allowedMethods.find(method => method.id === tender.methodId)
  if (!method) return { ok: false, error: 'unknown_method' }
  if (method.kind === 'manual' && tender.amountTenderedCentavos !== frozen.totalCentavos) {
    return { ok: false, error: 'manual_amount_mismatch' }
  }
  if (method.kind === 'cash' && tender.amountTenderedCentavos < frozen.totalCentavos) {
    return { ok: false, error: 'insufficient_cash' }
  }
  if (tender.reference !== undefined && tender.reference !== null) {
    if (typeof tender.reference !== 'string' || tender.reference.trim().length > 128
      || Array.from(tender.reference).some(character => {
        const code = character.charCodeAt(0)
        return code <= 31 || (code >= 127 && code <= 159)
      })) return { ok: false, error: 'invalid_reference' }
  }
  const reference = typeof tender.reference === 'string' ? tender.reference.trim() || null : null
  if (method.requiresReference && reference === null) return { ok: false, error: 'reference_required' }
  return {
    ok: true,
    value: {
      methodId: method.id,
      kind: method.kind,
      amountTenderedCentavos,
      changeCentavos: amountTenderedCentavos - frozen.totalCentavos,
      reference,
    },
  }
}
