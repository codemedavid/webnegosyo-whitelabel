'use client'

import { useState } from 'react'
import { BatteryFull, ChevronLeft, Signal, Wifi } from 'lucide-react'
import { renderSample, segmentMeter } from '@/lib/texts/view/message'
import { useTexts } from '../texts-context'

interface PhonePreviewProps {
  template: string
  samples: { label: string; body: string }[]
  /** "Today 10:00 AM" — when the guest would get it. */
  stamp: string
  /** A body rendered elsewhere (automatic texts); hides "Preview as". */
  body?: string
}

/** A real-looking phone: the store as the sender, the bubble as the guest reads it, what it costs below. */
export function PhonePreview({ template, samples, stamp, body: givenBody }: PhonePreviewProps) {
  const { storeName, optOutLine } = useTexts()
  const [sampleIndex, setSampleIndex] = useState(-1)
  const sample = sampleIndex >= 0 ? samples[sampleIndex] : undefined
  const body = givenBody ?? (sample ? sample.body : renderSample(template, storeName, optOutLine))
  const meter = segmentMeter({ template, storeName, optOutLine, reach: 0 })

  return (
    <div className="mx-auto w-full max-w-[300px] space-y-4">
      {givenBody === undefined && <label className="flex items-center justify-center gap-2 text-xs text-wn-stone">
        Preview as
        <select
          value={sampleIndex < samples.length ? sampleIndex : -1}
          onChange={(event) => setSampleIndex(Number(event.target.value))}
          className="h-11 rounded-full border border-wn-line bg-white px-3 text-sm text-foreground shadow-sm sm:h-9"
        >
          <option value={-1}>A sample guest (Maria)</option>
          {samples.map((s, index) => <option key={`${s.label}-${index}`} value={index}>{s.label}</option>)}
        </select>
      </label>}
      <div className="rounded-[2.75rem] bg-wn-ink p-2.5 shadow-[0_24px_48px_-24px_rgba(29,24,21,0.45)]">
        <div className="overflow-hidden rounded-[2.2rem] bg-white">
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold" aria-hidden="true">
            <span>9:41</span>
            <span className="h-5 w-20 rounded-full bg-wn-ink" />
            <span className="flex items-center gap-1"><Signal className="h-3 w-3" /><Wifi className="h-3 w-3" /><BatteryFull className="h-3.5 w-3.5" /></span>
          </div>
          <div className="flex flex-col items-center gap-1 border-b border-stone-100 px-4 pb-3 pt-2">
            <span className="flex w-full items-center" aria-hidden="true"><ChevronLeft className="h-5 w-5 text-sky-600" /></span>
            <span className="-mt-5 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-stone-300 to-stone-400 text-sm font-semibold text-white" aria-hidden="true">
              {storeName.trim().charAt(0).toUpperCase() || 'S'}
            </span>
            <span className="text-xs font-medium">{storeName}</span>
          </div>
          <div className="min-h-[300px] px-3 pb-6 pt-3">
            <p className="mb-3 text-center text-[10px] font-medium text-stone-400">Text Message · {stamp}</p>
            {body ? (
              <p className="relative max-w-[85%] whitespace-pre-wrap break-words rounded-[1.1rem] rounded-bl-[0.3rem] bg-stone-100 px-3.5 py-2 text-[13px] leading-snug text-stone-900">{body}</p>
            ) : (
              <p className="pt-16 text-center text-xs text-stone-400">Your message shows here.</p>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-wn-stone tabular-nums">
        {meter.segments <= 1 ? '1 text per guest' : `${meter.segments} texts per guest`} · sent from your store’s own SIM
      </p>
    </div>
  )
}
