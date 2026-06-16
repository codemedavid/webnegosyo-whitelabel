export default function TenantEditLoading() {
  return (
    <div className="space-y-8">
      {/* Breadcrumbs skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-4 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-20 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-4 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-12 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>

      <div className="space-y-6">
        {/* Sticky header bar skeleton */}
        <div className="rounded-2xl border border-white/10 bg-[#0a0a0a]/80 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="space-y-2">
                <div className="h-6 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
                <div className="h-4 w-64 animate-pulse rounded-xl bg-white/[0.06]" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-28 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="h-10 w-28 animate-pulse rounded-xl bg-white/[0.06]" />
            </div>
          </div>
        </div>

        {/* Tab strip skeleton */}
        <div className="flex flex-wrap gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
          ))}
        </div>

        {/* Tab body skeleton */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="mb-4 h-6 w-36 animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="space-y-4">
            {[...Array(5)].map((_, j) => (
              <div key={j} className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
