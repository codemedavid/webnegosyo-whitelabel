import Link from 'next/link'
import { ArrowRight, Store } from 'lucide-react'
import type { Tenant } from '@/types/database'
import { Panel, SectionHeader, StatusBadge, EmptyState } from '@/components/superadmin/ui/primitives'
import { getConsoleCaller } from '@/lib/platform-staff/guard'
import { hasPlatformPermission } from '@/lib/platform-staff/permissions'

/**
 * Recent restaurants list for the superadmin dashboard.
 *
 * Pure presentational server component — receives the already-fetched tenant
 * slice from the page (no data fetching of its own) so the page owns the query
 * boundary and Suspense streaming.
 */
const ROW_CLASS =
  'flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/20 hover:bg-white/[0.04]'

export async function RecentRestaurants({ tenants }: { tenants: Tenant[] }) {
  const appUser = (await getConsoleCaller())?.appUser
  const canView = hasPlatformPermission(appUser, 'tenants.view')
  const canCreate = hasPlatformPermission(appUser, 'tenants.create')

  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader
        icon={Store}
        title="Recent restaurants"
        subtitle="Latest additions to the platform"
        action={
          canView ? (
            <Link
              href="/superadmin/tenants"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : undefined
        }
      />

      <div className="mt-5 flex-1">
        {tenants.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No restaurants yet"
            description="Add your first restaurant to get started"
            action={
              canCreate ? (
                <Link
                  href="/superadmin/tenants/new"
                  className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
                >
                  Add restaurant
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2">
            {tenants.map((tenant) => (
              <li key={tenant.id}>
                {canView ? (
                  <Link href={`/superadmin/tenants/${tenant.id}`} className={ROW_CLASS}>
                    <RestaurantRowBody tenant={tenant} />
                  </Link>
                ) : (
                  <div className={ROW_CLASS}>
                    <RestaurantRowBody tenant={tenant} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

function RestaurantRowBody({ tenant }: { tenant: Tenant }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: tenant.primary_color || '#6366f1' }}
            aria-hidden
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-white">{tenant.name}</h3>
          <p className="truncate text-xs text-white/45">/{tenant.slug}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {tenant.domain ? (
          <span className="hidden max-w-[10rem] truncate text-xs text-white/45 sm:inline">
            {tenant.domain}
          </span>
        ) : null}
        <StatusBadge active={tenant.is_active} />
      </div>
    </>
  )
}
