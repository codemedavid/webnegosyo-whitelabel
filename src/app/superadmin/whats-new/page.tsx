import Link from 'next/link'
import { BellRing, Eye, FileText, Plus, Smartphone } from 'lucide-react'
import { KpiCard, PageHeader } from '@/components/superadmin/ui/primitives'
import { AnnouncementList } from '@/components/superadmin/announcements/announcement-list'
import { countAnnouncementRecipientsAction, listAnnouncementsAction } from '@/app/actions/announcements'

export const dynamic = 'force-dynamic'

export default async function WhatsNewPage() {
  const [announcements, deviceCount] = await Promise.all([
    listAnnouncementsAction(),
    countAnnouncementRecipientsAction(null).catch(() => null),
  ])
  const published = announcements.filter((a) => a.status === 'published')
  const totalReads = announcements.reduce((sum, a) => sum + a.readCount, 0)
  const lastPush = announcements
    .filter((a) => a.pushSentAt)
    .sort((a, b) => (b.pushSentAt ?? '').localeCompare(a.pushSentAt ?? ''))[0]

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Live posts"
          value={published.length}
          icon={FileText}
          hint={`${announcements.length - published.length} in draft`}
        />
        <KpiCard label="Total reads" value={totalReads} icon={Eye} hint="Across every published post" />
        <KpiCard
          label="Reachable devices"
          value={deviceCount ?? '—'}
          icon={Smartphone}
          hint={deviceCount === 0 ? 'Devices register on the next app update' : 'Registered merchant phones'}
        />
        <KpiCard
          label="Last notification"
          value={lastPush ? lastPush.pushRecipientCount ?? 0 : '—'}
          icon={BellRing}
          hint={lastPush ? `“${lastPush.title}”` : 'Nothing sent yet'}
        />
      </div>

      <AnnouncementList initialItems={announcements} />
    </div>
  )
}
