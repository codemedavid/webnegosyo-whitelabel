import { PageHeader } from '@/components/superadmin/ui/primitives'
import { AnnouncementEditor } from '@/components/superadmin/announcements/announcement-editor'
import { listAudienceTenantsAction } from '@/app/actions/announcements'

export const dynamic = 'force-dynamic'

export default async function NewAnnouncementPage() {
  const tenants = await listAudienceTenantsAction()

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="What's New" title="New post" subtitle="Drafts are invisible to merchants until you publish." />
      <AnnouncementEditor initial={null} tenants={tenants} />
    </div>
  )
}
