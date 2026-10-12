import { ReceiptEditor } from '@/components/admin/receipt-editor/receipt-editor'
import { getCachedTenantBySlug } from '@/lib/cache'
import { readReceiptTaxIdentity } from '@/lib/receipt-tax-server'

/**
 * Receipt Studio — design the thermal receipt: pick a format or stack custom
 * blocks (order details, fill-in lines, tracking QR, …) and publish to the
 * printer. The studio renders as a full-screen overlay, Branding Studio style.
 */
export default async function ReceiptEditorPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  // The preview shows the TIN header, VAT block and footer the store's
  // receipts carry once Tax & discounts is set up (the admin layout gated us).
  const tax = await readReceiptTaxIdentity(tenant.id)

  return (
    <ReceiptEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      storeName={tenant.name}
      logoUrl={tenant.logo_url ?? null}
      initialLayout={tenant.receipt_layout ?? null}
      tax={tax}
    />
  )
}
