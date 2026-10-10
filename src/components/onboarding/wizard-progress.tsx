'use client'

import { Check } from 'lucide-react'
import { ACCENT, OB } from './onboarding-ui'
import { WIZARD_CHAPTERS, type WizardStep } from './wizard-draft'

/**
 * Progress as chapters, not 13 steps: a done "Paid" segment first (paying IS
 * step one, so the bar never starts empty), then About you, Your store, Go
 * live. The current chapter fills as its questions are answered.
 */

function chapterFill(chapterSteps: readonly WizardStep[], step: WizardStep, chapterIndex: number, currentChapter: number): number {
  if (chapterIndex < currentChapter) return 1
  if (chapterIndex > currentChapter) return 0
  const position = chapterSteps.indexOf(step)
  // Half a step in: you are ON this question, not done with it.
  return Math.max(0.06, (position + 0.5) / chapterSteps.length)
}

export function ChapterProgress({ step }: { step: WizardStep }) {
  const currentChapter = WIZARD_CHAPTERS.findIndex((chapter) => (chapter.steps as readonly WizardStep[]).includes(step))
  const done = WIZARD_CHAPTERS.reduce((sum, chapter, index) => sum + chapterFill(chapter.steps, step, index, currentChapter), 1)
  const total = WIZARD_CHAPTERS.length + 1

  return (
    <div role="progressbar" aria-label="Set-up progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((done / total) * 100)}>
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: ACCENT }} title="Paid">
          <Check className="h-3 w-3" strokeWidth={3.5} style={{ color: 'var(--ob-accent-ink, #FFFFFF)' }} aria-hidden />
        </span>
        {WIZARD_CHAPTERS.map((chapter, index) => (
          <span key={chapter.id} className={`h-2.5 overflow-hidden rounded-full ${chapter.id === 'live' ? 'w-12 shrink-0' : 'flex-1'}`} style={{ backgroundColor: OB.line }}>
            <span
              className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${chapterFill(chapter.steps, step, index, currentChapter) * 100}%`, backgroundColor: ACCENT }}
            />
          </span>
        ))}
      </div>
      <div className="mt-2 hidden gap-1.5 pl-[26px] text-[12px] font-semibold sm:flex" aria-hidden>
        {WIZARD_CHAPTERS.map((chapter, index) => (
          <span key={chapter.id} className={chapter.id === 'live' ? 'w-12 shrink-0 whitespace-nowrap' : 'flex-1'} style={{ color: index === currentChapter ? OB.ink : OB.faint }}>
            {chapter.label}
          </span>
        ))}
      </div>
    </div>
  )
}
