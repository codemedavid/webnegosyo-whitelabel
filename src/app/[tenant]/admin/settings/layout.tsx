import { SettingsShell } from '@/components/admin/settings/settings-shell'
import { loadSettingsContext } from '@/lib/settings/load-settings-context'

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const context = await loadSettingsContext(tenantSlug)
  if (!context) return <>{children}</>

  // The rail moves between settings topics only; tools open their own pages.
  const railGroups = context.catalog
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => entry.kind === 'section') }))
    .filter((group) => group.entries.length > 0)

  return (
    <SettingsShell overviewHref={`/${tenantSlug}/admin/settings`} railGroups={railGroups}>
      {children}
    </SettingsShell>
  )
}
