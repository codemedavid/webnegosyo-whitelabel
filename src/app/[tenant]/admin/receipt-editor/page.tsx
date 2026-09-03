import { ReceiptEditor } from '@/components/admin/receipt-editor/receipt-editor'
import { getCachedTenantBySlug } from '@/lib/cache'

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

  return (
    <ReceiptEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      storeName={tenant.name}
      logoUrl={tenant.logo_url ?? null}
      initialLayout={tenant.receipt_layout ?? null}
    />
  )
}
