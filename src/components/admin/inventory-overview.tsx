'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  PackageX,
  TrendingDown,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import type { AutoHiddenDish } from '@/lib/inventory/auto-86-blame'
import type { InventoryHealth } from '@/lib/inventory/inventory-health'

interface InventoryOverviewProps {
  health: InventoryHealth
  autoHidden: AutoHiddenDish[]
  activity: ActivityFeedEntry[]
  /** The ledger read failed — distinct from a quiet day with nothing in it. */
  activityLoadFailed?: boolean
}

/**
 * Locale formatting runs on the client only.
 *
 * Rendering a locale-formatted date during SSR produces different text on the
 * server and the client and trips hydration — a bug this codebase has already
 * shipped twice.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Timestamp({ iso }: { iso: string }) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {isMounted ? formatTimestamp(iso) : ''}
    </span>
  )
}

interface StatProps {
  label: string
  value: number
  tone?: 'neutral' | 'warn' | 'bad'
  hint?: string
}

function Stat({ label, value, tone = 'neutral', hint }: StatProps) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-3xl font-semibold tabular-nums',
          tone === 'warn' && value > 0 && 'text-amber-600',
          tone === 'bad' && value > 0 && 'text-red-600',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const DIRECTION_CLASS = {
  in: 'text-emerald-600',
  out: 'text-red-600',
  mixed: 'text-muted-foreground',
} as const

/**
 * What inventory is doing, and where it cannot.
 *
 * Every panel here answers a question that previously had no surface at all: a
 * merchant could switch inventory on, have it deduct nothing because no dish had
 * a recipe, and see exactly what a working setup on a quiet day looks like.
 */
export function InventoryOverview({
  health,
  autoHidden,
  activity,
  activityLoadFailed = false,
}: InventoryOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Ingredients"
          value={health.ingredients.total}
          hint={`${health.ingredients.ok} in good supply`}
        />
        <Stat label="Running low" value={health.ingredients.low} tone="warn" />
        <Stat label="Out of stock" value={health.ingredients.out} tone="bad" />
        <Stat
          label="Dishes set up"
          value={health.dishes.withRecipe}
          hint={`of ${health.dishes.total} on your menu`}
        />
      </div>

      {health.gaps.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <h3 className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Not everything is switched on
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Each of these is a part of inventory that cannot run right now.
          </p>
          <ul className="mt-3 space-y-3">
            {health.gaps.map((gap) => (
              <li key={gap.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{gap.title}</p>
                  {!gap.isSelfServe && (
                    <Badge variant="outline" className="text-xs">
                      Needs support
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{gap.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-4">
          <EyeOff className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Taken off the menu</h3>
          {autoHidden.length > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {autoHidden.length}
            </Badge>
          )}
        </div>

        {autoHidden.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Nothing is hidden for lack of stock — every dish with a recipe can be made.
          </p>
        ) : (
          <ul className="divide-y">
            {autoHidden.map((dish) => (
              <li key={dish.menuItemId} className="flex flex-wrap items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{dish.name}</p>
                  {dish.blockingIngredients.length > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Waiting on{' '}
                      <span className="font-medium text-foreground">
                        {dish.blockingIngredients.map((i) => i.name).join(', ')}
                      </span>
                      . Restock and it goes back on sale by itself.
                    </p>
                  ) : (
                    /*
                      Hidden with nothing left holding it down. The recovery path
                      should already have put this back, so surfacing it is the
                      only way a merchant finds a dish stuck off their menu.
                    */
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-500">
                      Its ingredients are back in stock but the dish has not returned. Switch it on
                      yourself under Menu Management.
                    </p>
                  )}
                </div>
                <Timestamp iso={dish.hiddenAt} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-4">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Recent activity</h3>
        </div>

        {activityLoadFailed ? (
          <p className="p-4 text-sm text-muted-foreground">
            We could not load your recent stock activity. Reload the page, and if it keeps happening
            the ledger read is failing.
          </p>
        ) : activity.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4" />
            Nothing has moved yet. Stock changes when you receive, count or waste it — and
            automatically when an order comes in for a dish with a recipe.
          </p>
        ) : (
          <ul className="divide-y">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {entry.title}
                    {entry.isAutomatic && (
                      <Badge variant="outline" className="text-xs font-normal">
                        Automatic
                      </Badge>
                    )}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-sm tabular-nums',
                      DIRECTION_CLASS[entry.direction],
                    )}
                  >
                    {entry.lines.join(' · ')}
                  </p>
                </div>
                <Timestamp iso={entry.createdAt} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {health.ingredients.total === 0 && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <PackageX className="h-4 w-4" />
          Start on the Ingredients tab — everything else here follows from it.
        </p>
      )}
    </div>
  )
}
