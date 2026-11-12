import { PageHeader } from '@/components/superadmin/ui/primitives'
import { AppsList } from '@/components/superadmin/app-studio/apps-list'
import { listAppStudioAppsAction, listStoresWithoutAppAction } from '@/app/actions/app-studio'

export const dynamic = 'force-dynamic'

export default async function CustomerAppsPage() {
  const [apps, stores] = await Promise.all([listAppStudioAppsAction(), listStoresWithoutAppAction()])
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customer apps"
        title="App Studio"
        subtitle="Each store’s own branded app: its name and icon, what Home shows, the store listing, and when it goes live."
      />
      <AppsList apps={apps} stores={stores} />
    </div>
  )
}
