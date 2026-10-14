import { chapterOf, type WizardStep } from '../wizard-draft'

/**
 * The set-up's celebration moments, decided here (pure) so the screens only
 * play them. A moment never blocks: it is skippable and short.
 */

export interface ChapterBreak {
  /** The chapter just finished. */
  doneLabel: string
  /** What comes next, in the owner's words. */
  headline: string
  line: string
}

const BREAK_COPY: Record<string, Omit<ChapterBreak, 'doneLabel'>> = {
  store: { headline: "Now let's build your store", line: 'Your name, your colors, your menu. Watch it come together.' },
  live: { headline: 'Your store is almost ready', line: 'One last step, then we build it for you.' },
}

/** How long a chapter break stays up before the next question slides in. */
export const CHAPTER_BREAK_MS = 1400

/** A break plays only when moving FORWARD from one chapter into the next. */
export function chapterBreakFor(from: WizardStep, to: WizardStep, steps: readonly WizardStep[]): ChapterBreak | null {
  if (steps.indexOf(to) <= steps.indexOf(from)) return null
  const fromChapter = chapterOf(from)
  const toChapter = chapterOf(to)
  if (!fromChapter || !toChapter || fromChapter.id === toChapter.id) return null
  const copy = BREAK_COPY[toChapter.id]
  return copy ? { doneLabel: fromChapter.label, ...copy } : null
}

/** "1 picked", "3 picked": the multi-select counter under the cards. */
export function pickedLabel(count: number): string {
  return count === 0 ? 'Pick as many as you like' : `${count} picked`
}
