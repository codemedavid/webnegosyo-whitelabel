import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ReceiptEditor } from '@/components/admin/receipt-editor/receipt-editor'
import { getCachedTenantBySlug } from '@/lib/cache'

/**
 * Receipt Studio — design the thermal receipt: pick a format or stack custom
 * blocks (logo line, notes, tracking QR, …) and publish to the printer.
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
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Settings', href: `/${tenantSlug}/admin/settings` },
          { label: 'Receipt Studio' },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold">Receipt Studio</h1>
        <p className="text-sm text-muted-foreground">
          Design what your thermal printer prints — pick a format or arrange
          your own blocks, with a live preview.
        </p>
      </div>
      <ReceiptEditor
        tenantId={tenant.id}
        storeName={tenant.name}
        initialLayout={tenant.receipt_layout ?? null}
      />
    </div>
  )
}
