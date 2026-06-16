/* Matching loading skeletons for the superadmin dashboard surfaces.
   Mirror the real layout (same grid spans, panel chrome, heights) so streaming
   in the live content causes no layout shift. */

function shimmer(extra: string) {
  return `animate-pulse rounded-xl bg-white/[0.06] ${extra}`
}

/** Four headline KPI tiles. */
export function DashboardKpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <div className={shimmer('h-4 w-20')} />
            <div className={shimmer('h-9 w-9')} />
          </div>
          <div className={shimmer('mt-4 h-8 w-24')} />
          <div className={shimmer('mt-2 h-3 w-32')} />
        </div>
      ))}
    </div>
  )
}

/** Revenue trend panel: header, two stat blocks, chart area. */
export function PlatformTrendSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center gap-3">
        <div className={shimmer('h-9 w-9')} />
        <div className="space-y-2">
          <div className={shimmer('h-5 w-40')} />
          <div className={shimmer('h-3 w-56')} />
        </div>
      </div>
      <div className="mt-5 flex gap-8">
        <div className="space-y-2">
          <div className={shimmer('h-3 w-20')} />
          <div className={shimmer('h-7 w-28')} />
        </div>
        <div className="space-y-2">
          <div className={shimmer('h-3 w-20')} />
          <div className={shimmer('h-7 w-24')} />
        </div>
      </div>
      <div className={shimmer('mt-5 h-[280px] w-full')} />
    </div>
  )
}

/** Feature adoption panel: header + four progress rows. */
export function FeatureAdoptionSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center gap-3">
        <div className={shimmer('h-9 w-9')} />
        <div className="space-y-2">
          <div className={shimmer('h-5 w-36')} />
          <div className={shimmer('h-3 w-28')} />
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className={shimmer('h-4 w-32')} />
              <div className={shimmer('h-4 w-16')} />
            </div>
            <div className={shimmer('h-1.5 w-full')} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Recent restaurants panel: header + eight rows. */
export function RecentRestaurantsSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={shimmer('h-9 w-9')} />
          <div className="space-y-2">
            <div className={shimmer('h-5 w-40')} />
            <div className={shimmer('h-3 w-48')} />
          </div>
        </div>
        <div className={shimmer('h-8 w-20')} />
      </div>
      <div className="mt-5 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
          >
            <div className="flex items-center gap-3">
              <div className={shimmer('h-9 w-9')} />
              <div className="space-y-1.5">
                <div className={shimmer('h-4 w-32')} />
                <div className={shimmer('h-3 w-20')} />
              </div>
            </div>
            <div className={shimmer('h-6 w-16 rounded-full')} />
          </div>
        ))}
      </div>
    </div>
  )
}
