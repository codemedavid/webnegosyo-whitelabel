import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader } from '@/components/superadmin/ui/primitives'
import { ClientMapExplorer } from '@/components/superadmin/client-map/client-map-explorer'
import { getClientMapData } from '@/lib/queries/client-map-server'

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
      <p className={accent ? 'text-xl font-bold tabular-nums text-emerald-300' : 'text-xl font-bold tabular-nums text-white'}>
        {value.toLocaleString('en-PH')}
      </p>
      <p className="text-[11px] uppercase tracking-widest text-white/45">{label}</p>
    </div>
  )
}

export default async function ClientMapPage() {
  const data = await getClientMapData()
  const { summary } = data

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/superadmin' }, { label: 'Client Map' }]} />

      <PageHeader
        eyebrow="Platform"
        title="Client Map"
        subtitle="Every live SmartMenu store, pinned where it serves. Tap a logo to open it."
        actions={
          <div className="grid grid-cols-3 gap-2">
            <Stat value={summary.total} label="Live clients" />
            <Stat value={summary.mapped} label="On the map" />
            <Stat value={summary.newThisMonth} label="New · 30 days" accent />
          </div>
        }
      />

      <ClientMapExplorer data={data} />
    </div>
  )
}
