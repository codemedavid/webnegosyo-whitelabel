'use client'

import { allKeepAwakeGuides, keepAwakeGuideFor, type KeepAwakeGuide } from '@/lib/texts/keep-awake'

function GuideSteps({ guide }: { guide: KeepAwakeGuide }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      {guide.steps.map((step) => <li key={step}>{step}</li>)}
    </ol>
  )
}

/** The steps that fit this phone's brand (generic when unknown). */
export function KeepAwakeSteps({ manufacturer, model }: { manufacturer: string | null; model: string | null }) {
  const guide = keepAwakeGuideFor(manufacturer, model)
  return (
    <div className="space-y-1.5">
      {guide.title && <p className="text-xs font-medium uppercase tracking-wide text-wn-stone">{guide.title}</p>}
      <GuideSteps guide={guide} />
    </div>
  )
}

/** Every brand, folded, for when the phone isn't connected yet. */
export function KeepAwakeByBrand() {
  return (
    <div className="space-y-1">
      {allKeepAwakeGuides().map((guide) => (
        <details key={guide.brand} className="group rounded-xl border border-wn-line bg-white px-3 py-2">
          <summary className="min-h-9 cursor-pointer list-none py-1 text-sm font-medium">{guide.title ?? 'Other Android phones'}</summary>
          <div className="pb-1 pt-1"><GuideSteps guide={guide} /></div>
        </details>
      ))}
    </div>
  )
}
