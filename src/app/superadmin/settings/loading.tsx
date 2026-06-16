export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-4 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-20 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>

      {/* Page header */}
      <div className="space-y-3">
        <div className="h-7 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-9 w-32 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-72 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Section nav */}
        <div className="hidden space-y-1 lg:block">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-9 w-full animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>

        {/* Panels */}
        <div className="min-w-0 space-y-8">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="space-y-2">
                <div className="h-6 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
                <div className="h-4 w-64 animate-pulse rounded-xl bg-white/[0.06]" />
              </div>
              <div className="mt-6 space-y-2">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-11 w-full animate-pulse rounded-xl bg-white/[0.06]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
