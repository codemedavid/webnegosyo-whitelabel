import type { DeliveryQuoteOutlet } from './use-delivery-quote'

interface OutletChoice {
  outlet: { id: string; latitude?: number | string | null; longitude?: number | string | null }
}

/**
 * The branch a delivery quote starts from. It always names the branch the
 * order will carry (`selectedOutletId`): the server signs the quote with that
 * branch, so a quote for "no branch" would never match an order that has one.
 * A branch missing from the list (switched off mid-visit) still goes by id;
 * the server reads its pin itself.
 */
export function deliveryQuoteOutlet(
  choices: readonly OutletChoice[],
  selectedOutletId: string | null | undefined,
): DeliveryQuoteOutlet | null {
  if (!selectedOutletId) return null
  const chosen = choices.find((choice) => choice.outlet.id === selectedOutletId)?.outlet
  if (!chosen) return { id: selectedOutletId, latitude: null, longitude: null }
  return { id: chosen.id, latitude: chosen.latitude, longitude: chosen.longitude }
}
