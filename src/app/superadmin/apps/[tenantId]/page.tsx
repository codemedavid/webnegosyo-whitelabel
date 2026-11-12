import { notFound } from 'next/navigation'
import { AppStudioEditor } from '@/components/superadmin/app-studio/app-studio-editor'
import { projectAppConfig } from '@/lib/app-api/project-config'
import { startingDraft } from '@/lib/app-studio/home-draft'
import { loadAppStudioStore } from '@/lib/app-studio/preview-input'
import { appStudioDb, readApp } from '@/lib/app-studio/service'
import { requirePlatformPermission } from '@/lib/platform-staff/guard'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AppStudioPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requirePlatformPermission('customer_apps.view')
  const { tenantId } = await params
  if (!UUID.test(tenantId)) notFound()
  const db = appStudioDb()
  const [record, tenant] = await Promise.all([readApp(db, tenantId), db.from('tenants').select('name, slug').eq('id', tenantId).maybeSingle()])
  if (!record || !tenant.data) notFound()
  const store = await loadAppStudioStore(tenant.data.slug)
  if (!store) notFound()

  // The store as the app sees it with nothing published: the base the draft is laid over.
  const base = projectAppConfig({ ...store.configInput, published: null })
  const effective = projectAppConfig({ ...store.configInput, published: record.config?.published ?? null })
  return (
    <AppStudioEditor
      tenantId={tenantId}
      storeName={tenant.data.name}
      storeSlug={tenant.data.slug}
      logoUrl={store.logoUrl}
      app={record.app}
      initialDraft={startingDraft(record.config?.draft, record.config?.published, effective)}
      publishedDraft={record.config?.published ?? null}
      publishedVersion={record.config?.published_version ?? 0}
      publishedAt={record.config?.published_at ?? null}
      base={base}
      catalog={store.catalog}
    />
  )
}
