import Link from 'next/link'
import { MessengerStudio } from '@/components/admin/messenger-studio/messenger-studio'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'
import { loadAutomationsPageData } from '@/lib/messenger/editor-data'

/** Full screen (`isFullBleedRoute`), so a message that isn't the Studio gets its own frame and a way back. */
function FullScreenMessage({ backHref, title, body }: { backHref: string; title: string; body: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#EFECE6] text-[#1D1815]">
      <div className="flex h-[54px] flex-shrink-0 items-center border-b border-[#E5E0D6] bg-white px-2 md:px-4">
        <Link href={backHref} className="flex h-[26px] items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">← Messenger</Link>
      </div>
      <div className="mx-auto mt-16 max-w-md space-y-2 px-6 text-center">
        <h1 className="text-[20px] font-extrabold">{title}</h1>
        <p role="alert" className="text-[14px] text-[#6B655B]">{body}</p>
      </div>
    </div>
  )
}

export default async function MessengerAutomationsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  // Same gate as the Messenger settings page: the `settings` permission.
  const { tenant, viewer } = await requireSettingsSection(tenantSlug, 'messenger')
  const backHref = `/${tenantSlug}/admin/settings/messenger`

  if (viewer.isBranchScopedAccount) {
    return <FullScreenMessage backHref={backHref} title="Messenger Studio" body="Automations are set for the whole store. Ask the owner, or sign in with a store-wide account." />
  }

  const data = await loadAutomationsPageData(tenant)
  if (!data.ok) return <FullScreenMessage backHref={backHref} title="Messenger Studio" body={data.error} />
  return <MessengerStudio tenantId={tenant.id} tenantSlug={tenantSlug} {...data.props} />
}
