export default function TenantsLoading() {
  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-4 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-7 w-24 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-9 w-44 animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="h-4 w-64 animate-pulse rounded-lg bg-white/[0.06]" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>

      {/* Overview KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
              <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
            </div>
            <div className="mt-4 h-8 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="h-11 w-full max-w-sm animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="flex items-center gap-2">
          <div className="h-10 w-44 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-10 w-40 animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="h-10 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
      </div>
      <div className="h-5 w-28 animate-pulse rounded-lg bg-white/[0.06]" />

      {/* Dense list */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <div className="divide-y divide-white/[0.06]">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-4 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded-lg bg-white/[0.06]" />
                <div className="h-3 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
              </div>
              <div className="hidden h-8 w-32 animate-pulse rounded-lg bg-white/[0.06] md:block" />
              <div className="hidden h-6 w-44 animate-pulse rounded-full bg-white/[0.06] lg:block" />
              <div className="hidden h-6 w-16 animate-pulse rounded-full bg-white/[0.06] sm:block" />
              <div className="h-8 w-16 animate-pulse rounded-lg bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
