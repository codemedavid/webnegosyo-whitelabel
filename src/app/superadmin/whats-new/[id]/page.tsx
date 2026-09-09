import { notFound } from 'next/navigation'
import { AnnouncementEditor } from '@/components/superadmin/announcements/announcement-editor'
import { getAnnouncementAction, listAudienceTenantsAction } from '@/app/actions/announcements'

export const dynamic = 'force-dynamic'

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [announcement, tenants] = await Promise.all([
    getAnnouncementAction(id),
    listAudienceTenantsAction(),
  ])
  if (!announcement) notFound()

  return <AnnouncementEditor initial={announcement} tenants={tenants} />
}
