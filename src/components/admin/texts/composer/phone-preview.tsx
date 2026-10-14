'use client'

import { useState } from 'react'
import { renderSample } from '@/lib/texts/view/message'
import { useTexts } from '../texts-context'

/** A phone with the store as the sender; "Preview as" switches between real guests. */
export function PhonePreview({ template, samples }: { template: string; samples: { label: string; body: string }[] }) {
  const { storeName, optOutLine } = useTexts()
  const [sampleIndex, setSampleIndex] = useState(-1)
  const sample = sampleIndex >= 0 ? samples[sampleIndex] : undefined
  const body = sample ? sample.body : renderSample(template, storeName, optOutLine)

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Preview as
        <select
          value={sampleIndex < samples.length ? sampleIndex : -1}
          onChange={(event) => setSampleIndex(Number(event.target.value))}
          className="h-11 rounded-md border bg-background px-2 text-sm text-foreground sm:h-9"
        >
          <option value={-1}>A sample guest (Maria)</option>
          {samples.map((s, index) => <option key={`${s.label}-${index}`} value={index}>{s.label}</option>)}
        </select>
      </label>
      <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border-4 border-foreground/80 bg-background p-3 shadow-sm">
        <p className="border-b pb-2 text-center text-xs font-semibold">{storeName}</p>
        <div className="min-h-48 pt-3">
          {body ? (
            <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">{body}</p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">Your message shows here.</p>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Sent from your store&apos;s phone, using its own SIM.</p>
    </div>
  )
}
