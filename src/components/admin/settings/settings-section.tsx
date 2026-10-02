import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { settingsSectionMeta, type SettingsSectionKey } from '@/lib/settings/settings-catalog'

interface SettingsSectionProps {
  tenantSlug: string
  section: SettingsSectionKey
  children: React.ReactNode
}

/** One settings topic: a way back, its heading in the overview's own words, then its cards. */
export function SettingsSection({ tenantSlug, section, children }: SettingsSectionProps) {
  const { title, summary } = settingsSectionMeta(section)

  return (
    <div className="space-y-6 pb-10">
      <div className="hidden sm:block">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: `/${tenantSlug}/admin` },
            { label: 'Settings', href: `/${tenantSlug}/admin/settings` },
            { label: title },
          ]}
        />
      </div>
      {/* A three-level trail does not fit a phone; one step back does. */}
      <Link
        href={`/${tenantSlug}/admin/settings`}
        className="-ml-1 inline-flex h-9 items-center gap-1 rounded-md pr-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All settings
      </Link>
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-muted-foreground">{summary}</p>
      </header>
      <div className="space-y-6">{children}</div>
    </div>
  )
}
