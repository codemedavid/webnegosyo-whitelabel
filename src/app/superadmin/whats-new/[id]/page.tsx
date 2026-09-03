import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/superadmin/ui/primitives'
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What's New"
        title={announcement.title}
        subtitle={
          announcement.status === 'published'
            ? 'Published. Edits go live as soon as you save.'
            : 'Draft. Merchants cannot see this yet.'
        }
      />
      <AnnouncementEditor initial={announcement} tenants={tenants} />
    </div>
  )
}
