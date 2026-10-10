import type { GoalTracker } from '@/lib/onboarding/goal-trackers'

/** One goal, its figure since the store opened, and the owner's own "before". */
export function GoalTrackerCard({ tracker }: { tracker: GoalTracker }) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-border" aria-label={`Goal tracker: ${tracker.title}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-wn-stone">{tracker.title}</p>
      <p className="mt-2 text-[12.5px] font-semibold text-wn-stone">{tracker.label}</p>
      <p className="text-[28px] font-extrabold leading-tight tracking-tight text-wn-ink tabular-nums">{tracker.value}</p>
      <p className="text-[12.5px] text-wn-stone">{tracker.caption}</p>
      {tracker.comparison && <p className="mt-2 inline-flex rounded-full bg-wn-sand px-2.5 py-1 text-[12px] font-bold text-wn-ink">{tracker.comparison}</p>}
      {tracker.before && (
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-wn-line pt-2.5 text-[12.5px]">
          <span className="text-wn-stone">Before SmartMenu</span>
          <span className="text-right font-bold text-wn-ink">{tracker.before}</span>
        </div>
      )}
    </section>
  )
}
