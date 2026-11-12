'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Loader2, Plus, Smartphone } from 'lucide-react'
import { createAppStudioAppAction } from '@/app/actions/app-studio'
import { usePlatformAccess } from '@/components/superadmin/platform-access-context'
import { EmptyState, Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import type { AppStudioListRow } from '@/lib/app-studio/service'
import { cn } from '@/lib/utils'
import { FIELD, STATUS_STYLE } from './studio-ui'

interface AppsListProps {
  apps: AppStudioListRow[]
  stores: { id: string; name: string; slug: string }[]
}

export function AppsList({ apps, stores }: AppsListProps) {
  const canEdit = usePlatformAccess().can('customer_apps.edit')
  return (
    <div className="space-y-6">
      {canEdit ? <SetUpApp stores={stores} /> : null}
      <Panel>
        <SectionHeader title="Apps" subtitle={`${apps.length} ${apps.length === 1 ? 'store has' : 'stores have'} an app`} />
        {apps.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={Smartphone} title="No apps yet" description="Set up a store’s app above to start." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {apps.map((app) => (
              <li key={app.tenantId}>
                <Link href={`/superadmin/apps/${app.tenantId}`} className="flex items-center gap-4 py-3 hover:bg-white/[0.02]">
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a store's own icon URL
                    <img src={app.iconUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-white/40">
                      <Smartphone className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{app.displayName}</p>
                    <p className="truncate text-xs text-white/50">
                      {app.storeName} · {app.bundleId}
                    </p>
                  </div>
                  {app.hasUnpublishedChanges ? <span className="text-xs text-amber-300/80">Unpublished changes</span> : null}
                  <span className="hidden text-xs text-white/40 sm:inline">
                    {app.publishedAt ? `Published v${app.publishedVersion}` : 'Never published'}
                  </span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[app.status])}>{app.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function SetUpApp({ stores }: { stores: AppsListProps['stores'] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return stores.filter((store) => store.name.toLowerCase().includes(needle) || store.slug.includes(needle)).slice(0, 8)
  }, [query, stores])

  const create = (tenantId: string) =>
    startTransition(async () => {
      const result = await createAppStudioAppAction(tenantId)
      if (!result.ok) return setError(result.error)
      router.push(`/superadmin/apps/${tenantId}`)
    })

  return (
    <Panel>
      <SectionHeader title="Set up an app" subtitle="Pick a store. Its app starts as a draft named after the store, with ids from its link." />
      <div className="mt-4 max-w-lg space-y-2">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setError(null)
          }}
          placeholder="Search stores by name or link"
          aria-label="Search stores"
          className={FIELD}
        />
        {matches.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-white/10">
            {matches.map((store) => (
              <li key={store.id}>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => create(store.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.04] disabled:opacity-50"
                >
                  <span className="truncate">
                    {store.name} <span className="text-white/40">· {store.slug}</span>
                  </span>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin text-white/50" /> : <Plus className="h-4 w-4 text-white/50" />}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </Panel>
  )
}
