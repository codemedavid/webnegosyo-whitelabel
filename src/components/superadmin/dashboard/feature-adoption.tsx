import { Boxes, Layers, Smartphone, Truck, type LucideIcon } from 'lucide-react'
import type { FeatureAdoption as FeatureAdoptionData } from '@/lib/queries/platform-analytics-server'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { formatPercent } from '@/components/superadmin/ui/format'

interface AdoptionRow {
  label: string
  count: number
  icon: LucideIcon
  /** tailwind accent color for the bar fill (bright-400) */
  accent: string
}

/**
 * Compact per-feature adoption readout (X of N tenants) with inline progress
 * bars. Range-independent — derived from tenant feature flags.
 */
export function FeatureAdoption({ data }: { data: FeatureAdoptionData }) {
  const total = data.total || 1
  const rows: AdoptionRow[] = [
    { label: 'Menu engineering', count: data.menuEngineering, icon: Layers, accent: 'bg-indigo-400' },
    { label: 'Bundles', count: data.bundles, icon: Boxes, accent: 'bg-amber-400' },
    { label: 'Mobile app', count: data.app, icon: Smartphone, accent: 'bg-emerald-400' },
    { label: 'Lalamove', count: data.lalamove, icon: Truck, accent: 'bg-sky-400' },
  ]

  return (
    <Panel>
      <SectionHeader
        icon={Layers}
        title="Feature adoption"
        subtitle={`Across ${data.total} restaurants`}
      />
      <ul className="mt-5 space-y-4">
        {rows.map((row) => {
          const Icon = row.icon
          const pct = (row.count / total) * 100
          return (
            <li key={row.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-white/70">
                  <Icon className="h-4 w-4 shrink-0 text-white/45" />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  <span className="font-semibold text-white">{row.count}</span>
                  <span className="text-xs text-white/40">/ {data.total}</span>
                  <span className="w-9 text-right text-xs text-white/55">
                    {formatPercent(row.count / total)}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full ${row.accent}`}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
