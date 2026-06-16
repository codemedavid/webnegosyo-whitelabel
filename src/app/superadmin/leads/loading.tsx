export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="h-4 w-40 animate-pulse rounded-md bg-white/[0.06]" />

      {/* Title */}
      <div>
        <div className="h-7 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="mt-4 h-9 w-32 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
            </div>
            <div className="mt-4 h-8 w-16 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded-xl bg-white/[0.06]" />
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
            <div>
              <div className="h-5 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="mt-2 h-3 w-40 animate-pulse rounded-xl bg-white/[0.06]" />
            </div>
          </div>
          <div className="h-7 w-20 animate-pulse rounded-xl bg-white/[0.06]" />
        </div>
        <div className="mt-6 h-2.5 w-full animate-pulse rounded-full bg-white/[0.06]" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="h-3 w-16 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="mt-3 h-6 w-12 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="mt-3 h-1 w-full animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-white/[0.06]" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-60 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-9 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
          </div>
        </div>
        <div className="space-y-3 p-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      </div>
    </div>
  )
}
