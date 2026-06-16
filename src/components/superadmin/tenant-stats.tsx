import { Layers } from 'lucide-react'
import { getTenantMetrics } from '@/lib/queries/tenant-metrics-server'
import { formatNumber, formatCurrencyCompact } from '@/components/superadmin/ui/format'
import {
  MetaItem,
  TenantHealthDot,
  formatRelativeTime,
} from '@/components/superadmin/tenant-visuals'
import type { Tenant } from '@/types/database'

/* =============================================================================
   Compact inline order-metrics row for the tenant workspace sticky header.

   Server component — fetches per-tenant metrics (cache()-wrapped) and renders a
   small wrapped row of MetaItem-style pills.
   ========================================================================== */

export async function TenantStats({ tenant }: { tenant: Tenant }) {
  const m = (await getTenantMetrics([tenant.id]))[tenant.id]

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <MetaItem>
        <span className="text-white/45">Orders</span>{' '}
        <span className="font-medium text-white/70">
          {formatNumber(m?.ordersLifetime ?? 0)}
        </span>
      </MetaItem>
      <MetaItem>
        <span className="text-white/45">GMV</span>{' '}
        <span className="font-medium text-white/70">
          {formatCurrencyCompact(m?.gmvLifetime ?? 0)}
        </span>
      </MetaItem>
      <MetaItem>
        <TenantHealthDot lastOrderAt={m?.lastOrderAt ?? null} />
        <span className="text-white/45">Last order</span>{' '}
        <span className="font-medium text-white/70">
          {formatRelativeTime(m?.lastOrderAt ?? null)}
        </span>
      </MetaItem>
      {tenant.convex_schema_version != null ? (
        <MetaItem icon={Layers}>
          <span className="font-medium text-white/70">
            Schema v{tenant.convex_schema_version}
          </span>
        </MetaItem>
      ) : null}
    </div>
  )
}
