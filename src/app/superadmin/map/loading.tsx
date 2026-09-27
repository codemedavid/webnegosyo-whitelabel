export default function ClientMapLoading() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-44 animate-pulse rounded-md bg-white/[0.06]" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-7 w-28 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-8 w-44 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-white/[0.06]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-[58px] w-28 animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[620px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="order-2 h-[520px] animate-pulse rounded-3xl border border-white/10 bg-white/[0.02] lg:order-1 lg:h-auto" />
        <div className="relative order-1 flex h-[64vh] min-h-[460px] items-center justify-center rounded-3xl border border-white/10 bg-black lg:order-2 lg:h-auto">
          <div className="relative h-16 w-16">
            <span className="absolute inset-0 animate-ping rounded-full border border-white/30" />
            <span className="absolute inset-3 rounded-full border border-white/40" />
            <span className="absolute inset-[26px] rounded-full bg-white" />
          </div>
        </div>
      </div>
    </div>
  )
}
