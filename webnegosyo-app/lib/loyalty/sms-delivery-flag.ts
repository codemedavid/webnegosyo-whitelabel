import Constants from "expo-constants";

/**
 * The handset half of the loyalty SMS release gate. The web routes are gated
 * separately by LOYALTY_SMS_DELIVERY_ENABLED; both must be on for a pilot.
 */
export function isLoyaltySmsDeliveryEnabled(): boolean {
  return Constants.expoConfig?.extra?.loyaltySmsDeliveryEnabled === true;
}
