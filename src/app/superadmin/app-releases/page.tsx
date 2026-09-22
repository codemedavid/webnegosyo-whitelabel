import { Smartphone, ShieldAlert, Apple, Bot } from 'lucide-react'
import { KpiCard, PageHeader } from '@/components/superadmin/ui/primitives'
import { AppReleaseEditor } from '@/components/superadmin/app-releases/app-release-editor'
import { listAppReleasesAction } from '@/app/actions/app-releases'

export const dynamic = 'force-dynamic'

export default async function AppReleasesPage() {
  const releases = await listAppReleasesAction()
  const ios = releases.find((r) => r.platform === 'ios') ?? null
  const android = releases.find((r) => r.platform === 'android') ?? null
  const blocking = releases.filter((r) => r.minimumVersion !== r.latestVersion).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Merchant app"
        title="App releases"
        subtitle="Tell merchants a new version exists — and cut off builds you no longer support."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="iOS latest" value={ios?.latestVersion ?? '—'} icon={Apple} hint={ios ? `Floor ${ios.minimumVersion}` : 'Not set'} />
        <KpiCard label="Android latest" value={android?.latestVersion ?? '—'} icon={Bot} hint={android ? `Floor ${android.minimumVersion}` : 'Not set'} />
        <KpiCard
          label="Platforms forcing an update"
          value={blocking}
          icon={ShieldAlert}
          hint={blocking === 0 ? 'Nobody is blocked' : 'Builds below the floor are locked out'}
        />
        <KpiCard label="Update delivery" value="On open" icon={Smartphone} hint="Merchants are asked once per app launch" />
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5 text-sm text-white/70">
        <p className="font-medium text-white">Two kinds of update, one prompt</p>
        <p className="mt-1.5 leading-relaxed">
          A <span className="text-white">JS-only</span> release reaches merchants over the air: the app offers it on open and
          &ldquo;Update now&rdquo; installs and restarts in seconds — nothing on this page is involved. This page is for a{' '}
          <span className="text-white">new binary</span>, which only the store can install. Raise{' '}
          <span className="text-white">Latest version</span> after a build goes live to nudge merchants; raise{' '}
          <span className="text-white">Minimum supported</span> only when an older build is genuinely unsafe to keep running — it
          locks those merchants out of the register until they update.
        </p>
      </div>

      <AppReleaseEditor initialReleases={releases} />
    </div>
  )
}
