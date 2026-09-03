import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/superadmin/ui/primitives'
import { AnnouncementList } from '@/components/superadmin/announcements/announcement-list'
import { listAnnouncementsAction } from '@/app/actions/announcements'

export const dynamic = 'force-dynamic'

export default async function WhatsNewPage() {
  const announcements = await listAnnouncementsAction()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Merchant app"
        title="What's New"
        subtitle="Write release posts merchants read in the app, and push a notification to every device on command."
        actions={
          <Link
            href="/superadmin/whats-new/new"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            <Plus className="h-4 w-4" />
            New post
          </Link>
        }
      />
      <AnnouncementList initialItems={announcements} />
    </div>
  )
}
