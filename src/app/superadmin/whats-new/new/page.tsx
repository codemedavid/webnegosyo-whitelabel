import { AnnouncementEditor } from '@/components/superadmin/announcements/announcement-editor'
import { listAudienceTenantsAction } from '@/app/actions/announcements'

export const dynamic = 'force-dynamic'

export default async function NewAnnouncementPage() {
  const tenants = await listAudienceTenantsAction()
  return <AnnouncementEditor initial={null} tenants={tenants} />
}
