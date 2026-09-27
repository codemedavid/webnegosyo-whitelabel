/** Native checkout does not obtain a signed Lalamove quote yet. Refuse before
 * any order write so the customer can finish through the store website. */
export function getMobileDeliveryCheckoutError(
  tenant: { lalamove_enabled?: boolean; convex_deployment_url?: string | null },
  orderType: { type: string; name?: string },
): string | null {
  if (!tenant.lalamove_enabled) return null
  if (tenant.convex_deployment_url?.trim()) {
    return 'Please complete checkout for this Lalamove-enabled store on its website, where delivery quotes are verified before ordering.'
  }
  if (orderType.type !== 'delivery') return null
  return 'Please use this store’s website to get a Lalamove delivery quote and place your order.'
}
