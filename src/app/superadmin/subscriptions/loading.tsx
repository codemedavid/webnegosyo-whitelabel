export default function SubscriptionsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-48 animate-pulse rounded-md bg-white/[0.06]" />
      <div className="space-y-3">
        <div className="h-7 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-8 w-48 animate-pulse rounded-md bg-white/[0.06]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
      <p className="text-center text-xs text-white/35">Reading payments and store activity…</p>
    </div>
  )
}
