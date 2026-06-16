import Link from 'next/link'
import { ArrowUpRight, Trophy } from 'lucide-react'
import { Panel, SectionHeader, StatusBadge, EmptyState } from '@/components/superadmin/ui/primitives'
import { formatCurrency, formatNumber } from '@/components/superadmin/ui/format'
import type { TopTenant } from '@/lib/queries/platform-analytics-server'

interface TopActiveTenantsProps {
  tenants: TopTenant[]
  /** human-readable window label for the section subtitle */
  rangeLabel: string
}

/* Revenue-aware leaderboard of the platform's top-grossing tenants.
   Presentational server component — no state, no client boundary. */
export function TopActiveTenants({ tenants, rangeLabel }: TopActiveTenantsProps) {
  const maxGmv = tenants.reduce((max, t) => Math.max(max, t.gmv), 0) || 1

  return (
    <Panel className="space-y-5">
      <SectionHeader
        icon={Trophy}
        title="Top restaurants by revenue"
        subtitle={`Ranked by gross merchandise value · ${rangeLabel}`}
      />

      {tenants.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No revenue in this window"
          description="Try a longer range to see the leaderboard."
        />
      ) : (
        <ul className="space-y-2.5">
          {tenants.map((tenant, index) => {
            const barWidth = Math.max(3, (tenant.gmv / maxGmv) * 100)
            const rank = index + 1

            return (
              <li key={tenant.tenantId}>
                <Link
                  href={`/superadmin/tenants/${tenant.tenantId}`}
                  className="group relative block overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  {/* Relative GMV bar, sits behind the content as a subtle fill. */}
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 bg-white/[0.04]"
                    style={{ width: `${barWidth}%` }}
                  />

                  <div className="relative flex items-center gap-4">
                    {/* Rank chip — gold / silver / bronze for the top three. */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                        rank === 1
                          ? 'border border-amber-400/20 bg-amber-400/10 text-amber-400'
                          : rank === 2
                            ? 'border border-white/15 bg-white/[0.08] text-white/80'
                            : rank === 3
                              ? 'border border-orange-400/20 bg-orange-400/10 text-orange-400'
                              : 'border border-white/10 bg-white/[0.04] text-white/45'
                      }`}
                    >
                      {rank}
                    </div>

                    {/* Identity */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-white">{tenant.name}</h3>
                        <StatusBadge active={tenant.isActive} className="hidden shrink-0 sm:inline-flex" />
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/45">
                        <span className="truncate">/{tenant.slug || tenant.tenantId.slice(0, 8)}</span>
                        <span className="text-white/30">·</span>
                        <span className="tabular-nums">{formatNumber(tenant.orders)} orders</span>
                        <span className="text-white/30">·</span>
                        <span className="tabular-nums">{formatCurrency(tenant.aov)} AOV</span>
                      </p>
                    </div>

                    {/* GMV + affordance */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <div className="text-lg font-bold tracking-tight text-white tabular-nums">
                          {formatCurrency(tenant.gmv)}
                        </div>
                        <p className="text-[10px] uppercase tracking-wide text-white/40">GMV</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-white/30 transition-colors group-hover:text-white/70" />
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
