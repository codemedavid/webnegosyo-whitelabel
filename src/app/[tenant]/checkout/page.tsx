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
import { getCachedTenantBySlug } from '@/lib/cache'
import { hasPublishedFlag, publishedDesignColumns } from '@/lib/page-designer/page-mode'
import type { PageId } from '@/lib/page-designer/types'
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
  const withDesigns = await withPublishedDesigns(tenant, tenantSlug)

  return <CheckoutView tenantSlug={tenantSlug} initialTenant={withDesigns} config={config} />
}

/** Pages checkout renders that the owner can design: the checkout itself, then the thank-you page. */
const CHECKOUT_PAGES: readonly PageId[] = ['checkout', 'confirmation']

/**
 * The storefront select carries only the Page Designer flags; a published
 * design's text comes from the cached full row, read only when one is live.
 * A failed read keeps the standard pages rather than failing checkout.
 */
async function withPublishedDesigns<T extends object>(tenant: T, tenantSlug: string): Promise<T> {
  const row = tenant as unknown as Record<string, unknown>
  if (!hasPublishedFlag(row, CHECKOUT_PAGES)) return tenant
  const full = await getCachedTenantBySlug(tenantSlug).catch(() => null)
  if (!full) return tenant
  return { ...tenant, ...publishedDesignColumns(full as unknown as Record<string, unknown>, CHECKOUT_PAGES) }
}
