import type { ReadyForYou } from '@/lib/onboarding/start-path-data'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-wn-stone">{label}</span>
      <span className="text-right font-bold text-wn-ink">{value}</span>
    </div>
  )
}

/** What the set-up left switched on, so the owner knows it is already working for them. */
export function ReadyCard({ ready, warnings }: { ready: ReadyForYou; warnings: string[] }) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-border" aria-labelledby="ready-for-you">
      <h2 id="ready-for-you" className="text-[11px] font-bold uppercase tracking-[0.07em] text-wn-stone">Ready for you</h2>
      <div className="mt-1 divide-y divide-wn-line">
        {ready.combosLive !== null && <Row label="Combos on your menu" value={String(ready.combosLive)} />}
        {ready.stampCard && <Row label="Stamp card" value={ready.stampCard} />}
        {ready.textsReady !== null && ready.textsReady > 0 && <Row label="Texts ready to turn on" value={String(ready.textsReady)} />}
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-wn-line pt-3">
          <p className="text-[12px] font-bold text-wn-ink">Look these over</p>
          {warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2 text-[12.5px] leading-snug text-wn-stone">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-wn-amber" aria-hidden />
              {warning}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
