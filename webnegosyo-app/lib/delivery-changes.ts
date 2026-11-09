/**
 * Only what the merchant changed in the delivery details sheet since it opened.
 * Mirrors `merchantDeliveryChanges` in src/lib/delivery/order-delivery-edit.ts.
 *
 * The rest is left out (absent = leave alone on the server), so a sheet opened
 * before the customer moved their pin from a pin link cannot send the old pin
 * and words back over theirs.
 */

import type { DeliveryDetailsPatch } from "./delivery-details-service";
import type { LatLng } from "./pos-checkout-fields";

export interface MerchantDeliveryDraft {
  address: string;
  pin: LatLng | null;
  unit: string;
  landmark: string;
  riderNote: string;
  storeNote: string;
}

const DRAFT_TEXT_FIELDS = ["unit", "landmark", "riderNote", "storeNote"] as const;

export function merchantDeliveryChanges(opened: MerchantDeliveryDraft, draft: MerchantDeliveryDraft): DeliveryDetailsPatch {
  const address = draft.address.trim();
  const isPinMoved =
    draft.pin !== null && (opened.pin === null || draft.pin.lat !== opened.pin.lat || draft.pin.lng !== opened.pin.lng);
  const texts = DRAFT_TEXT_FIELDS.filter((field) => draft[field].trim() !== opened[field].trim());
  return {
    ...(address !== "" && address !== opened.address.trim() ? { address } : {}),
    ...(isPinMoved && draft.pin ? { pin: draft.pin } : {}),
    ...Object.fromEntries(texts.map((field) => [field, draft[field].trim()])),
  };
}
