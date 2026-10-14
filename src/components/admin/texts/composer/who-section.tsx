'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AudienceFilter, AudiencePreset } from '@/lib/texts/types'
import { AUDIENCE_SEGMENTS, applySegment, describeCustomAudience, presetForFilter, type SegmentId } from '@/lib/texts/view/audience'
import { RadioChips } from '../radio-chips'
import { AudienceCount } from './audience-count'
import { ComposerSection } from './composer-section'
import { CustomAudience } from './custom-audience'
import type { PreviewState } from './use-audience-preview'

const OPTIONS = [
  ...AUDIENCE_SEGMENTS.map((segment) => ({ value: segment.id as AudiencePreset, label: segment.title, description: segment.description })),
]

interface WhoSectionProps {
  audience: AudienceFilter
  onChange: (audience: AudienceFilter) => void
  preview: PreviewState
  onRetry: () => void
}

export function WhoSection({ audience, onChange, preview, onRetry }: WhoSectionProps) {
  const preset = presetForFilter(audience)
  // Closed by default even for a preset's own filter: the Custom chip already says who it is.
  const [isCustomOpen, setCustomOpen] = useState(false)
  const options = preset === 'custom'
    ? [...OPTIONS, { value: 'custom' as AudiencePreset, label: 'Custom', description: describeCustomAudience(audience) }]
    : OPTIONS

  return (
    <ComposerSection id="composer-who" step={1} title="Who gets it">
      <RadioChips
        label="Who gets it"
        size="card"
        options={options}
        value={preset}
        onChange={(value) => {
          if (value === 'custom') return setCustomOpen(true)
          onChange(applySegment(value as SegmentId))
        }}
      />
      <button
        type="button"
        aria-expanded={isCustomOpen}
        aria-controls="composer-custom-audience"
        onClick={() => setCustomOpen((open) => !open)}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground sm:min-h-0"
      >
        More options <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${isCustomOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {isCustomOpen && (
        <div id="composer-custom-audience">
          <CustomAudience audience={audience} onChange={onChange} />
        </div>
      )}
      <AudienceCount state={preview} onRetry={onRetry} />
    </ComposerSection>
  )
}
