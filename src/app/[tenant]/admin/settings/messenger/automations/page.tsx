import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AutomationsEditor } from '@/components/admin/messenger-automations/automations-editor'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'
import { loadAutomationsPageData } from '@/lib/messenger/editor-data'

export default async function MessengerAutomationsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  // Same gate as the Messenger settings page: the `settings` permission.
  const { tenant, viewer } = await requireSettingsSection(tenantSlug, 'messenger')

  const back = (
    <Link href={`/${tenantSlug}/admin/settings/messenger`} className="-ml-1 inline-flex h-9 items-center gap-1 rounded-md pr-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ChevronLeft className="h-4 w-4" aria-hidden /> Messenger
    </Link>
  )

  if (viewer.isBranchScopedAccount) {
    return (
      <div className="space-y-4 pb-10">
        {back}
        <h1 className="text-2xl font-bold tracking-tight">Messenger automations</h1>
        <p className="text-muted-foreground">Automations are set for the whole store. Ask the owner, or sign in with a store-wide account.</p>
      </div>
    )
  }

  const data = await loadAutomationsPageData(tenant)

  return (
    <div className="space-y-6 pb-10">
      {back}
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Messenger automations</h1>
        <p className="text-muted-foreground">Choose what your Page’s chat answers by itself: your menu, categories, dishes, hours, or your own words.</p>
      </header>
      {data.ok ? (
        <AutomationsEditor tenantId={tenant.id} {...data.props} />
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground" role="alert">{data.error}</p>
      )}
    </div>
  )
}
