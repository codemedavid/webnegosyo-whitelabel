/**
 * Checkout page (server).
 *
 * Reads everything checkout renders from before the page is sent: the tenant
 * (the shared, cached storefront read the tenant layout has already warmed)
 * and the checkout config — order types, form fields, payment methods,
 * branches and the Messenger page id — in one parallel batch.
 *
 * This replaced a browser-side chain that began only after the JavaScript had
 * downloaded and hydrated: tenant, then order types, then form fields and
 * payment methods, three sequential round trips behind a spinner, repeated for
 * every order-type switch.
 *
 * Dynamic: the config is read fresh per request (see load-checkout-config.ts
 * for why it is not cached), and a build must never render against the live
 * database.
 */
import { CheckoutNotFound } from '@/components/customer/checkout-templates/checkout-shared'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { loadCheckoutConfig } from '@/lib/checkout/load-checkout-config'
import { CheckoutView } from './checkout-view'

export const dynamic = 'force-dynamic'

interface CheckoutPageProps {
  params: Promise<{ tenant: string }>
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { tenant: tenantSlug } = await params
  const { tenant, error } = await getStorefrontTenant(tenantSlug)

  // A failed read is not "no such store": let the tenant error boundary offer
  // a retry instead of telling a real store's customer it does not exist.
  if (error) throw new Error(`Checkout could not load the store: ${error}`)
  if (!tenant) return <CheckoutNotFound />

  const config = await loadCheckoutConfig(tenant)

  return <CheckoutView tenantSlug={tenantSlug} initialTenant={tenant} config={config} />
}
