function SkeletonPanel({ className }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.02] p-6 ${className ?? ''}`}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-3 w-24 animate-pulse rounded-md bg-white/[0.06]" />
        </div>
      </div>
      <div className="mt-6 h-48 w-full animate-pulse rounded-xl bg-white/[0.04]" />
    </div>
  )
}

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded-md bg-white/[0.06]" />
        <div className="h-4 w-4 animate-pulse rounded-md bg-white/[0.06]" />
        <div className="h-4 w-20 animate-pulse rounded-md bg-white/[0.06]" />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-7 w-36 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-8 w-32 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-white/[0.06]" />
        </div>
        <div className="h-9 w-64 animate-pulse rounded-full bg-white/[0.06]" />
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 animate-pulse rounded-md bg-white/[0.06]" />
              <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
            </div>
            <div className="mt-4 h-8 w-24 animate-pulse rounded-md bg-white/[0.06]" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded-md bg-white/[0.06]" />
          </div>
        ))}
      </div>

      {/* Hero trend */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded-md bg-white/[0.06]" />
              <div className="h-3 w-28 animate-pulse rounded-md bg-white/[0.06]" />
            </div>
          </div>
          <div className="h-9 w-40 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        <div className="mt-6 h-[300px] w-full animate-pulse rounded-xl bg-white/[0.04]" />
      </div>

      {/* Two-up breakdowns */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="space-y-2">
            <div className="h-4 w-52 animate-pulse rounded-md bg-white/[0.06]" />
            <div className="h-3 w-40 animate-pulse rounded-md bg-white/[0.06]" />
          </div>
        </div>
        <div className="mt-6 space-y-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[68px] w-full animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    </div>
  )
}
